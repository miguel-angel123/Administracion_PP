// Importa bcrypt para generar hashes de contrasena.
// Nota: package.json instala bcryptjs, no bcrypt; este script puede requerir ajuste.
const bcrypt = require('bcrypt');

// readline permite pedir texto por terminal.
const readline = require('readline');

// Configura la interfaz para leer la terminal
const rl = readline.createInterface({
    // Entrada estandar: lo que el usuario escribe.
    input: process.stdin,
    // Salida estandar: donde se imprime la pregunta.
    output: process.stdout
});

// Pide la contraseña al usuario
rl.question('Introduce la contraseña que deseas hashear: ', async (password) => {
    // El callback se ejecuta cuando el usuario presiona Enter.
    try {
        // Cantidad de rondas de bcrypt: mas alto es mas lento pero mas resistente.
        const saldos = 10; // Número de rondas de procesamiento (cost factor)
        
        // Genera el hash de forma asíncrona
        // El hash resultante es lo que se guarda en la base de datos.
        const hash = await bcrypt.hash(password, saldos);
        
        // Encabezado visual del resultado.
        console.log('\n--- Resultado ---');
        // Imprime el hash generado.
        console.log(`Hash generado: ${hash}`);
    } catch (error) {
        // Muestra errores de bcrypt o del runtime.
        console.error('Error al generar el hash:', error);
    } finally {
        // Cierra readline para que el proceso pueda terminar.
        rl.close();
    }
});
