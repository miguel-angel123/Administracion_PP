export interface Usuario {
  id: number;
  doc: string;
  password: string;
  role: "gerente" | "empleado" | "cliente";
  name: string;
  estado: string;
}

export interface Vehiculo {
  id: number;
  placa: string;
  nombre: string;
  tipo: string;
  puesto: string;
  telefono: string;
  correo: string;
  estado: string;
  ingreso: string;
  salida: string;
}

export interface Empleado {
  id: number;
  doc: string;
  nombre: string;
  cargo: string;
  telefono: string;
  correo: string;
  estado: string;
}

export interface Sugerencia {
  id: number;
  usuario: string;
  fecha: string;
  texto: string;
  reseña: number;
  estado: string;
}

export interface Ticket {
  id: string;
  placa: string;
  propietario: string;
  entrada: string;
  salida: string;
  total: string;
  estado: string;
}

export interface LogEntry {
  id: number;
  tipo: string;
  usuario: string;
  accion: string;
  fecha: string;
}

export const USUARIOS: Usuario[] = [
  { id: 1, doc: "1122338718", password: "123", role: "gerente",  name: "Miguel Ángel Colobón", estado: "activo" },
  { id: 2, doc: "123", password: "123", role: "empleado", name: "Isaac Aray",            estado: "activo" },
  { id: 3, doc: "124", password: "124", role: "empleado", name: "Miguel Ángel Godoy",   estado: "activo" },
  { id: 4, doc: "1234", password: "1234",  role: "cliente",  name: "Carlos Pérez",          estado: "activo" },
];

export const VEHICULOS_INIT: Vehiculo[] = [
  { id: 1, placa: "ABC123", nombre: "Carlos Pérez",    tipo: "mensual",  puesto: "A-12", telefono: "3001234567", correo: "carlos@gmail.com", estado: "activo",   ingreso: "2025-04-01", salida: "—" },
  { id: 2, placa: "XYZ789", nombre: "Laura Gómez",     tipo: "diario",   puesto: "B-03", telefono: "3119876543", correo: "laura@hotmail.com", estado: "activo",   ingreso: "2025-05-10 08:00", salida: "2025-05-10 17:00" },
  { id: 3, placa: "DEF456", nombre: "Andrés Torres",   tipo: "mensual",  puesto: "C-07", telefono: "3204561234", correo: "andres@gmail.com", estado: "inactivo", ingreso: "2025-03-01", salida: "—" },
  { id: 4, placa: "GHI321", nombre: "Marcela Ruiz",    tipo: "diario",   puesto: "A-05", telefono: "3155557890", correo: "marcela@gmail.com", estado: "activo",   ingreso: "2025-05-10 09:30", salida: "—" },
];

export const EMPLEADOS_INIT: Empleado[] = [
  { id: 1, doc: "1101046453", nombre: "Isaac Aray",          cargo: "Vigilante",   telefono: "3001112233", correo: "isaac@pradera.co",  estado: "trabajando" },
  { id: 2, doc: "1010992419", nombre: "Miguel Ángel Godoy",  cargo: "Operativo",   telefono: "3112223344", correo: "godoy@pradera.co",  estado: "descansando" },
  { id: 3, doc: "5566778899", nombre: "Jhon Martínez",       cargo: "Vigilante",   telefono: "3123334455", correo: "jhon@pradera.co",   estado: "trabajando" },
];

export const SUGERENCIAS_INIT: Sugerencia[] = [
  { id: 1, usuario: "Carlos Pérez",  fecha: "2025-05-08", texto: "Sería útil tener más iluminación en la zona B.",      reseña: 4, estado: "pendiente" },
  { id: 2, usuario: "Laura Gómez",   fecha: "2025-05-09", texto: "El acceso peatonal está muy estrecho.",               reseña: 3, estado: "leída" },
  { id: 3, usuario: "Andrés Torres", fecha: "2025-05-10", texto: "Podrían instalar cámaras en el nivel 2 por seguridad.", reseña: 5, estado: "pendiente" },
];
