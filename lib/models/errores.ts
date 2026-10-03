// Error de dominio. Permite que los controladores devuelvan el status HTTP correcto
// sin tener que adivinar. Ejemplo: throw new ErrorDominio("No existe", 404).
// Extiende Error para poder usarse con throw/catch como cualquier error normal.
export class ErrorDominio extends Error {
  // Codigo HTTP sugerido para la respuesta del endpoint.
  status: number;

  // message describe el problema; status por defecto es 400 Bad Request.
  constructor(message: string, status = 400) {
    // Inicializa la clase base Error con el mensaje.
    super(message);
    // Nombre propio para logs y depuracion.
    this.name = "ErrorDominio";
    // Guarda el status que luego lee respuestaError.
    this.status = status;

    // Con target es2017+ (Next 15) no hace falta, pero es blindaje por si
    // tsconfig baja a ES5: sin esto, `instanceof ErrorDominio` devuelve false
    // y respuestaError clasifica el 400/404 como 500.
    Object.setPrototypeOf(this, ErrorDominio.prototype);

    // Arranca la traza en el `throw` del modelo, no en este constructor.
    // Esto hace que el stack trace apunte al sitio donde se lanzo el error.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ErrorDominio);
    }
  }
}
