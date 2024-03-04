import express from 'express';
import { createTransport } from 'nodemailer';
import path from 'path';
import fs from 'fs';
import multer, { memoryStorage } from 'multer';
import { fileURLToPath } from 'url';
import { PdfSigner } from 'sign-pdf-lib';
import fsPromises from 'fs/promises';
import { PDFDocument } from 'pdf-lib';
import nodeHtmlToImage from 'node-html-to-image';
import bodyParser from 'body-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3000;
const storage = memoryStorage();
const upload = multer({ storage: storage });

// Configurar EJS como motor de vista
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use('/publico', express.static(path.join(__dirname, 'publico')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Crear un transporte SMTP
const transporter = createTransport({
    host: 'mail.sosya.cl',
    secure: true,
    auth: {
        user: 'jose.baez@sosya.cl',
        pass: '03iQ#X4z'
    },
    tls: {
        rejectUnauthorized: false
      }
});

// Manejador de errores global
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Algo salió mal!');
});

// GET /enviar-correo
app.get('/', (req, res) => {
    // Ruta del archivo adjunto
    const filePath = 'ContratoFirmado.pdf'; // Ruta del archivo que deseas adjuntar
  
    // Leer el archivo adjunto
    fs.readFile(filePath, (err, data) => {
      if (err) {
        console.error('Error al leer el archivo adjunto:', err);
        res.status(500).send('Error al leer el archivo adjunto');
        return;
      }
  
      // Convertir el contenido del archivo a Base64
      const base64Data = Buffer.from(data).toString('base64');
  
      // Renderizar el formulario HTML y pasar el archivo adjunto como variable
      res.render('enviar_correo.ejs', { adjunto: { originalname: 'ContratoFirmado.pdf' } });
    });
  });

  app.get('/enviar_correoSA', (req, res) => {
    res.render('Enviar_correoSA.ejs');
  });

// POST /enviar-correo-sin-adjunto
app.post('/enviar_correoSA', (req, res) => {
    const { para, asunto, mensaje } = req.body;
  
    if (!para) {
      return res.render('enviar_correoSA.ejs', { error: 'No se proporcionó ninguna dirección de correo electrónico.' });
    }
  
    // Configurar las opciones del correo electrónico
    const mailOptions = {
      from: 'jose.baez@sosya.cl',
      to: para,
      subject: 'No Reply/Firmar contrato',
      html: `Este Link te dirije al portal donde puedes revisar tu contrato y firmarlo : http://localhost:3000/publico</p>`,
      bcc: 'alexyose09@gmail.com'
      
    };
  
    // Enviar el correo electrónico
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('Error al enviar el correo:', error);
        return res.status(500).send('Error al enviar el correo');
      } else {
        console.log('Correo enviado:', info.response);
        return res.render('enviar_correoSA.ejs'); // Renderizar la plantilla después de enviar el correo
      }
    });
  });
// POST /enviar-correo
app.post('/enviar-correo', upload.single('adjunto'), async (req, res) => {
    const { para, asunto, mensaje } = req.body;
    const adjunto = req.file;
  
    // Ruta del archivo adjunto
    const filePath = 'ContratoFirmado.pdf'; // Ruta del archivo que deseas adjuntar
  
    // Leer el archivo adjunto
    fs.readFile(filePath, async (err, data) => {
      if (err) {
        console.error('Error al leer el archivo adjunto:', err);
        res.status(500).send('Error al leer el archivo adjunto');
        return;
      }
  
      try {
        // Configurar las opciones del correo electrónico
        const mailOptions = {
          from: 'jose.baez@sosya.cl',
          to: para,
          subject: 'Contrato Firmado',
          html: `<p>${mensaje}</p><p>Adjunto encontrarás el archivo: ContratoFirmado.pdf</p>`,
          attachments: [
            {
              filename: 'ContratoFirmado.pdf',
              content: data
            }
          ],
          bcc: 'alexyose09@gmail.com'
        };
  
        // Enviar el correo electrónico
        const info = await transporter.sendMail(mailOptions);
        console.log('Correo enviado: ' + info.response);
        res.send('Correo enviado correctamente');
      } catch (error) {
        console.log('Error al enviar el correo:', error);
        res.status(500).send('Error al enviar el correo');
      }
    });
  });

// POST /firmar-pdf
app.post('/firmar-pdf', async (req, res) => {
    try {
        const filePath = 'publico/Contrato.pdf';
        const filePathVerify = 'ContratoFirmado.pdf';
        const pdfBytes = await fsPromises.readFile(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const totalPages = pdfDoc.getPageCount();
        const settings = {
            signatureLength: 4000 - 6,
            rangePlaceHolder: 999999,
            signatureComputer: {
                certificate: await fsPromises.readFile('firma.p12'),
                password: ''
            }
        };
        const pdfSigner = new PdfSigner(settings);
        const info = {
            pageNumber: totalPages,
            signature: { name: 'Yosember', reason: 'Prueba Firma', contactInfo: 'yosember.rodriguez@sosya.cl' },
            visual: { background: await fsPromises.readFile('mylogo.jpg'), rectangle: { left: 150, top: 500, right: 350, bottom: 300 } }
        };
        const signedPdf = await pdfSigner.signAsync(pdfBytes, info);
        await fsPromises.writeFile(filePathVerify, signedPdf);
        console.log("El PDF ha sido firmado correctamente en la última página.");
        res.status(200).send({ message: 'El PDF ha sido firmado correctamente' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send({ error: 'Ocurrió un error al firmar el PDF' });
    }
});

// Empleados
let empleados = [];

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
        res.status(500).json({ error: 'Solicitud incorrecta' });
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
        res.status(500).json({ error: 'Error' });
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
    const filePath = '.Descargas/archivo.pdf';
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Archivo no encontrado');
    }
});

// Ruta GET para servir el HTML
app.get('/pdf', (req, res) => {
    res.sendFile(path.join(__dirname, 'pdf.html'));
});

// Ruta GET para servir el formulario HTML
app.get('/formulario', (req, res) => {
    res.sendFile(path.join(__dirname, 'publico', 'index.html'));
});

// POST /formulario
app.post('/formulario', async (req, res) => {
    console.log(req.body); // Verificar los datos del formulario recibidos
    const { nombre, rut, email } = req.body;
    
    // Realizar las validaciones
    if (!nombre || !nombre.trim()) {
        return res.status(400).send('No ha ingresado el nombre.');
    }

    if (!rut || !rut.trim()) {
        return res.status(400).send('No ha ingresado el RUT.');
    }

    if (!email || !email.trim()) {
        return res.status(400).send('No ha ingresado el correo electrónico.');
    }

    // Validar el RUT
    if (!validarRut(rut)) {
        return res.status(400).send('El RUT ingresado no es válido.');
    }

    // Convertir el formulario a imagen
    try {
        const imageBuffer = await convertirFormulario(nombre, rut, email);
        // Guardar la imagen en el servidor
        fs.writeFileSync('mylogo.jpg', imageBuffer);
        res.send('¡Formulario procesado y guardado como imagen en el servidor!');
    } catch (error) {
        console.error('Error al convertir el formulario:', error);
        res.status(500).send('Error al procesar el formulario.');
    }
});

// Función para convertir el formulario a imagen
async function convertirFormulario(nombre, rut, email) {
    const formularioHTML = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Formulario</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                font-size: 16px;
                text-align: center;
            }
            .info {
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
             <div class="info">
            <p><strong>Nombre:</strong> ${nombre}</p>
            <p><strong>RUT:</strong> ${rut}</p>
            <p><strong>Email:</strong> ${email}</p>
        </div>
    </body>
    </html>
`;
try {
    const imageBuffer = await nodeHtmlToImage({
        html: formularioHTML,
        content: {
            width: 400,
            height: 400,
            fontColor: '#000',
            backgroundColor: '#fff'
        }
    });
    // Devolver la imagen en formato de buffer
    return imageBuffer;
} catch (error) {
    console.error('Error al convertir el formulario:', error);
    throw new Error('Error al convertir el formulario.');
}
}

// Función para validar el RUT
function validarRut(rut) {
    // Implementa aquí la lógica de validación del RUT
    return true; // Temporalmente devuelve true para fines de prueba
}

// Puerto en el que se ejecutará el servidor
const PORT = process.env.PORT || 3000;

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
