// Error de dominio. Permite que los controladores devuelvan el status HTTP correcto
// sin tener que adivinar. Ejemplo: throw new ErrorDominio("No existe", 404).
export class ErrorDominio extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ErrorDominio";
    this.status = status;
  }
}
