-- =============================================================================
-- Reparación puntual: parser ope=12 no detectaba pdc cuando Fastrax lo devolvía
-- bajo la clave `ped` del segundo elemento del vector (sin clave `pdc`).
-- Para esta orden, Fastrax SÍ generó el pedido (pdc = 4730224), por lo que la
-- fila local quedó marcada `failed` aun siendo exitosa en Fastrax. Ya quedó
-- corregido el parser; este UPDATE solo cierra el caso actual.
--
-- order_id            : 83619a9a-8ed2-4423-9d3f-d6cb2c63bb8b
-- fastrax_ped (envío) : FX-83619A9A8ED24423
-- fastrax_pdc (real)  : 4730224
--
-- Idempotente: solo actúa si la fila aún no tiene un fastrax_pdc válido,
-- evitando pisar datos si Fastrax es resincronizado por otra vía.
-- =============================================================================

update tradexpar.fastrax_order_map
set
  status              = 'succeeded',
  fastrax_status      = 'succeeded',
  fastrax_order_id    = '4730224',
  fastrax_pdc         = '4730224',
  fastrax_ped         = 'FX-83619A9A8ED24423',
  error               = null,
  last_error          = null,
  updated_at          = now()
where order_id = '83619a9a-8ed2-4423-9d3f-d6cb2c63bb8b'
  and (fastrax_pdc is null or btrim(fastrax_pdc) = '');

-- Verificación opcional (descomentar para ejecutar manualmente y revisar):
-- select order_id, status, fastrax_status, fastrax_ped, fastrax_pdc,
--        fastrax_order_id, last_error, updated_at
-- from tradexpar.fastrax_order_map
-- where order_id = '83619a9a-8ed2-4423-9d3f-d6cb2c63bb8b';
