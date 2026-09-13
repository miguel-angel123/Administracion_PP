// Error de dominio. Permite que los controladores devuelvan el status HTTP correcto
// sin tener que adivinar. Ejemplo: throw new ErrorDominio("No existe", 404).
export class ErrorDominio extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ErrorDominio";
    this.status = status;

    // Con target es2017+ (Next 15) no hace falta, pero es blindaje por si
    // tsconfig baja a ES5: sin esto, `instanceof ErrorDominio` devuelve false
    // y respuestaError clasifica el 400/404 como 500.
    Object.setPrototypeOf(this, ErrorDominio.prototype);

    // Arranca la traza en el `throw` del modelo, no en este constructor.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ErrorDominio);
    }
  }
}
