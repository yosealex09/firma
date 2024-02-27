import express from 'express';
import path from 'path';
import { PdfSigner } from 'sign-pdf-lib';
import fsPromises from 'fs/promises';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import bodyParser from 'body-parser';
import multer from 'multer';

// Crear una instancia de la aplicación Express
const app = express();

// Definir el directorio actual
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

// Configurar multer para gestionar la carga de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads');
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// Middleware para procesar JSON
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json({ limit: '200mb' }));
// Empleados
let empleados = []; // Inicializamos la lista de empleados vacía

// Ruta para firmar el PDF
app.post('/firmar-pdf', async (req, res) => {
    try {
        const filePath = 'publico/Contrato.pdf';
        const filePathVerify = 'ContratoFirmado.pdf';

        // Leer el PDF para obtener el número total de páginas
        const pdfBytes = await fsPromises.readFile(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const totalPages = pdfDoc.getPageCount();

        // Crear una instancia de PdfSigner con la configuración necesaria
        const settings = {
            signatureLength: 4000 - 6,
            rangePlaceHolder: 9999999,
            signatureComputer: {
                certificate: await fsPromises.readFile('firma.p12'),
                password: '',
            }
        };
        const pdfSigner = new PdfSigner(settings);

        // Definir los parámetros de la firma
        const info = {
            pageNumber: totalPages, // Firma en la última página
            signature: {
                name: 'Yosember',
                reason: 'Prueba Firma',
                contactInfo: 'yosember.rodriguez@sosya.cl'
            },
            visual: {
                background: await fsPromises.readFile('mylogo.jpg'),
                rectangle: { left: 50, top: 800, right: 300, bottom: 650 }
                // Coordenadas más pequeñas para el rectángulo de la firma
            }
        };

        // Firmar el PDF
        const signedPdf = await pdfSigner.signAsync(pdfBytes, info);

        // Escribir el PDF firmado en un archivo
        await fsPromises.writeFile(filePathVerify, signedPdf);

        console.log("El PDF ha sido firmado correctamente en la última página.");

        res.status(200).send({ message: 'El PDF ha sido firmado correctamente' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send({ error: 'Ocurrió un error al firmar el PDF' });
    }
});

// Ruta para obtener todos los empleados
app.get('/empleados', (req, res) => {
    res.json(empleados);
});

// Ruta para agregar un nuevo empleado
app.post('/empleados', (req, res) => {
    const { nombre, apellido, nacionalidad, rut } = req.body;
    if (nombre && apellido && nacionalidad && rut) {
        const id = empleados.length + 1;
        const newEmpleado = { id, ...req.body };
        empleados.push(newEmpleado);
        res.json(empleados);
    } else {
        res.status(500).json({ error: 'wrong request' });
    }
});

// Ruta para actualizar un empleado existente por su ID
app.put('/empleados/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, nacionalidad, rut } = req.body;
    if (nombre && apellido && nacionalidad && rut) {
        const index = empleados.findIndex(empleado => empleado.id === parseInt(id));
        if (index !== -1) {
            empleados[index] = { id: parseInt(id), nombre, apellido, nacionalidad, rut };
            res.json(empleados);
        } else {
            res.status(404).json({ error: 'Empleado no encontrado' });
        }
    } else {
        res.status(500).json({ error: 'error' });
    }
});

// Ruta para eliminar un empleado por su ID
app.delete('/empleados/:id', (req, res) => {
    const { id } = req.params;
    const index = empleados.findIndex(empleado => empleado.id === parseInt(id));
    if (index !== -1) {
        empleados.splice(index, 1);
        res.json(empleados);
    } else {
        res.status(404).json({ error: 'Empleado no encontrado' });
    }
});

// Ruta para subir un archivo (requiere multer) 
app.post('/uploads', upload.single('file'), async (req, res) => {
    try {
        const fileContent = await fsPromises.readFile(req.file.path, 'binary');
        console.log('Contenido del archivo:', fileContent);
        const base64Data = Buffer.from(fileContent, 'binary').toString('base64');
        fs.writeFileSync('data.txt', base64Data, 'base64');
        res.send(base64Data);
    } catch (error) {
        console.error('Error al procesar el archivo:', error);
        res.status(500).send('Error al procesar el archivo.');
    }
});
// Ruta para manejar las solicitudes GET a /api/uploads/Descargas
app.get('/Descargas', (req, res) => {
    const filePath = '.Descargas/archivo.pdf'; // Ruta del archivo que deseas descargar

    // Verificar si el archivo existe
    if (fs.existsSync(filePath)) {
        // Si el archivo existe, enviarlo como respuesta
        res.sendFile(filePath);
    } else {
        // Si el archivo no existe, enviar una respuesta de error 404
        res.status(404).send('Archivo no encontrado');
    }
});

// Ruta GET para servir el HTML
app.get('/pdf', (req, res) => {
    // Utilizamos el método sendFile para enviar el archivo HTML
    res.sendFile(path.join(__dirname, 'pdf.html'));
});

// Ruta absoluta del archivo HTML
const htmlPath = path.resolve(__dirname, 'publico', 'index.html');

// Sirve el archivo HTML estático desde el servidor en la ruta '/publico'
app.get('/publico', (req, res) => {
    res.sendFile('index.html', { root: 'publico' });
});

// Puerto en el que se ejecutará el servidor
const PORT = process.env.PORT || 3000;

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
