const bcrypt = require('bcrypt');
const readline = require('readline');

// Configura la interfaz para leer la terminal
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Pide la contraseña al usuario
rl.question('Introduce la contraseña que deseas hashear: ', async (password) => {
    try {
        const saldos = 10; // Número de rondas de procesamiento (cost factor)
        
        // Genera el hash de forma asíncrona
        const hash = await bcrypt.hash(password, saldos);
        
        console.log('\n--- Resultado ---');
        console.log(`Hash generado: ${hash}`);
    } catch (error) {
        console.error('Error al generar el hash:', error);
    } finally {
        rl.close();
    }
});