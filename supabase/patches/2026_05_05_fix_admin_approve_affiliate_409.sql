-- =============================================================================
-- PATCH 2026-05-05 — Fix 409 (unique_violation) al aprobar solicitudes de afiliado
-- -----------------------------------------------------------------------------
-- Problema:
--   Al aprobar una solicitud cuyo email ya existía en `tradexpar.affiliates`
--   (por ejemplo, un distribuidor previamente suspendido o que se postuló dos
--   veces), el INSERT rompía con `unique_violation` (Postgres 23505) y
--   PostgREST devolvía HTTP 409, dejando la transacción a la mitad y al panel
--   admin con un toast genérico ("Conflict").
--
-- Solución:
--   Reescribir `tradexpar.admin_approve_affiliate_request(uuid)` para:
--     1) Detectar emails duplicados (case-insensitive) ANTES de insertar.
--     2) Si el afiliado ya existe → reactivarlo, asegurar regla de comisión
--        global y un link activo, y vincularlo a la nueva request.
--     3) Si por una carrera el email aparece después: capturar
--        `unique_violation` y devolver `{ ok:false, reason:'email_already_affiliate' }`.
--     4) Reintentar hasta 5 veces si la colisión es por `code` (también unique).
--
-- Aplicar en Supabase SQL Editor con el rol `postgres` (no anon).
-- Idempotente: usa CREATE OR REPLACE.
-- =============================================================================

create or replace function tradexpar.admin_approve_affiliate_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  r tradexpar.affiliate_requests%rowtype;
  v_code text;
  v_aff uuid;
  v_existing tradexpar.affiliates%rowtype;
  v_email_norm text;
  v_attempts int := 0;
begin
  select * into r from tradexpar.affiliate_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'request_not_found');
  end if;
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  v_email_norm := lower(trim(coalesce(r.email, '')));
  if v_email_norm = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  select * into v_existing
  from tradexpar.affiliates
  where lower(email) = v_email_norm
  limit 1;

  if found then
    update tradexpar.affiliates
    set status        = 'active',
        name          = coalesce(nullif(trim(r.full_name), ''), name),
        phone         = coalesce(nullif(trim(r.phone),     ''), phone),
        document_id   = coalesce(nullif(trim(r.document_id), ''), document_id),
        request_id    = p_request_id,
        updated_at    = now()
    where id = v_existing.id;

    insert into tradexpar.affiliate_commission_rules (affiliate_id, product_id, commission_percent)
    select v_existing.id, null, coalesce(v_existing.commission_rate, 10.00)
    where not exists (
      select 1 from tradexpar.affiliate_commission_rules
      where affiliate_id = v_existing.id and product_id is null
    );

    insert into tradexpar.affiliate_links (affiliate_id, label, ref_token, is_active)
    select v_existing.id, 'Principal', v_existing.code, true
    where not exists (
      select 1 from tradexpar.affiliate_links
      where affiliate_id = v_existing.id and is_active = true
    );

    update tradexpar.affiliate_requests
    set status = 'approved', reviewed_at = now()
    where id = p_request_id;

    return jsonb_build_object(
      'ok', true,
      'reactivated', true,
      'affiliate_id', v_existing.id,
      'code', v_existing.code
    );
  end if;

  loop
    v_attempts := v_attempts + 1;
    v_code := tradexpar.generate_unique_affiliate_code();
    begin
      insert into tradexpar.affiliates (code, name, email, phone, document_id, commission_rate, status, request_id)
      values (v_code, r.full_name, r.email, r.phone, r.document_id, 10.00, 'active', p_request_id)
      returning id into v_aff;
      exit;
    exception
      when unique_violation then
        if exists (
          select 1 from tradexpar.affiliates where lower(email) = v_email_norm
        ) then
          return jsonb_build_object(
            'ok', false,
            'reason', 'email_already_affiliate',
            'detail', 'Ya existe un afiliado con ese correo. Recargá la lista.'
          );
        end if;
        if v_attempts >= 5 then
          return jsonb_build_object('ok', false, 'reason', 'code_collision');
        end if;
    end;
  end loop;

  insert into tradexpar.affiliate_commission_rules (affiliate_id, product_id, commission_percent)
  values (v_aff, null, 10.00);

  insert into tradexpar.affiliate_links (affiliate_id, label, ref_token, is_active)
  values (v_aff, 'Principal', v_code, true);

  update tradexpar.affiliate_requests
  set status = 'approved', reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object('ok', true, 'affiliate_id', v_aff, 'code', v_code);
end;
$$;

grant execute on function tradexpar.admin_approve_affiliate_request(uuid)
  to anon, authenticated, service_role;

-- Verificación rápida (opcional):
-- select tradexpar.admin_approve_affiliate_request('<uuid-de-una-request-pending>');
