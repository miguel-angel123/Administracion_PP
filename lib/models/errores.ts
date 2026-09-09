export class ErrorDominio extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ErrorDominio";
    this.status = status;
  }
}
