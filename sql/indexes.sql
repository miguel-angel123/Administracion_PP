-- Índices. Idempotente. Ejecutar en Neon.
-- Parciales donde el WHERE es fijo: el planner los usa mejor.
CREATE INDEX IF NOT EXISTS idx_tickets_placa_abierto
  ON tickets(vehiculos_placa) WHERE fecha_eliminado IS NULL AND fecha_salida IS NULL;
CREATE INDEX IF NOT EXISTS idx_contratos_placa_vigente
  ON contratos(vehiculos_placa, fecha_fin) WHERE fecha_eliminado IS NULL;
CREATE INDEX IF NOT EXISTS idx_logs_fecha ON logs_sistema(fecha DESC) WHERE fecha_eliminado IS NULL;
CREATE INDEX IF NOT EXISTS idx_sugerencias_doc ON sugerencias(usuarios_documento);
CREATE INDEX IF NOT EXISTS idx_tarifa_modal_tipo
  ON tarifa(tipo_vehiculo, tipo_vehiculo_id) WHERE fecha_eliminado IS NULL;
CREATE INDEX IF NOT EXISTS idx_puestos_libre ON puestos(estado_puesto) WHERE fecha_eliminado IS NULL;
