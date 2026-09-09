-- Migración: tipos de vehículo + columnas para tarifas por tipo, puestos, tickets

CREATE TABLE IF NOT EXISTS tipos_vehiculo (
  id_tipo_vehiculo SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  icono VARCHAR(10) NOT NULL DEFAULT '🚗',
  fecha_eliminado TIMESTAMP NULL
);

DROP INDEX IF EXISTS idx_tipos_vehiculo_nombre;

INSERT INTO tipos_vehiculo (nombre, icono) VALUES
  ('Automóvil', '🚗'),
  ('Moto', '🏍️'),
  ('Camioneta', '🚙'),
  ('Camión', '🚚')
ON CONFLICT DO NOTHING;

ALTER TABLE vehiculos
ADD COLUMN IF NOT EXISTS tipo_vehiculo_id INTEGER REFERENCES tipos_vehiculo(id_tipo_vehiculo);

ALTER TABLE tarifa
ADD COLUMN IF NOT EXISTS tipo_vehiculo_id INTEGER NULL REFERENCES tipos_vehiculo(id_tipo_vehiculo);

ALTER TABLE contratos
ADD COLUMN IF NOT EXISTS puestos_id_puesto INTEGER NULL REFERENCES puestos(id_puesto);

ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS tipo_vehiculo_id INTEGER NULL REFERENCES tipos_vehiculo(id_tipo_vehiculo);

COMMENT ON COLUMN tarifa.tipo_vehiculo IS 'Modalidad del servicio: diario, mensual o por_hora';
