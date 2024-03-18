import express from 'express';
import { createTransport } from 'nodemailer';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { PdfSigner } from 'sign-pdf-lib';
import { promises as fsPromises } from 'fs';
import { PDFDocument } from 'pdf-lib';
import nodeHtmlToImage from 'node-html-to-image';
import bodyParser from 'body-parser';
import session from 'express-session';
import './database/connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3000;
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const validationCodes = new Map();

// Configurar EJS como motor de vista
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use('/publico', express.static(path.join(__dirname, 'publico')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// Configurar middleware de sesiones
app.use(session({
    secret: 'secret_key', // Cambia esto por una clave secreta más segura
    resave: false,
    saveUninitialized: false
}));

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

// Middleware de autenticación
const requireAuth = (req, res, next) => {
    // Verificar si el usuario está autenticado
    if (req.session.user) {
        return next(); // Permitir el acceso
    } else {
        res.redirect('/login'); // Redirigir al usuario a la página de inicio de sesión si no está autenticado
    }
};

// Manejador de errores global
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Algo salió mal!');
});

// Función para enviar el código de validación por correo electrónico
function sendValidationCode(email, code) {
    // Configurar las opciones del correo electrónico
    const mailOptions = {
        from: 'jose.baez@sosya.cl',
        to: email,
        subject: 'Código de Validación',
        text: `Tu código de validación es: ${code}`
    };

    // Enviar el correo electrónico
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error al enviar el correo:', error);
        } else {
            console.log('Correo enviado:', info.response);
        }
    });
}

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

// Ruta para cargar la página y mostrar la lista de correos
app.get('/enviar_correoSA', (req, res) => {
    // Obtener los datos de correos desde el archivo JSON
    const correos = JSON.parse(fs.readFileSync('data.json', 'utf8'));

    // Renderizar la vista 'Enviar_correoSA.ejs' con los datos de correos
    res.render('Enviar_correoSA', { correos: correos });
});

// Ruta para enviar correo a múltiples destinatarios obtenidos de data.json
app.post('/enviar_correoSA', (req, res) => {
    try {
        // Cargar usuarios desde data.json
        const usuarios = cargarUsuariosDesdeJSON();

        // Verificar que se cargaron usuarios
        if (usuarios.length === 0) {
            return res.status(500).send('No se pudieron cargar los usuarios desde data.json');
        }

        // Obtener las direcciones de correo electrónico de los usuarios
        const destinatarios = usuarios.map(usuario => usuario.correo);

        // Configurar las opciones del correo electrónico
        const mailOptions = {
            from: 'jose.baez@sosya.cl',
            to: destinatarios.join(', '), // Unir las direcciones de correo con comas
            subject: 'Asunto del correo',
            text: 'Ingrese al link para validar sus datos : http://localhost:3000/ValidacionCorreo',
            bcc: 'alexyose09@gmail.com'
        };

        // Enviar el correo electrónico
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error al enviar el correo:', error);
                return res.status(500).send('Error al enviar el correo');
            } else {
                console.log('Correo enviado:', info.response);
                return res.send('Correo enviado correctamente');
            }
        });
    } catch (error) {
        console.error('Error al enviar el correo:', error);
        return res.status(500).send('Error al enviar el correo');
    }
});

// Función para cargar los usuarios desde el archivo JSON
function cargarUsuariosDesdeJSON() {
    try {
        // Lee el contenido del archivo data.json
        const usuariosJson = fs.readFileSync('data.json', 'utf8');
        
        // Parsea el contenido a un objeto JavaScript
        const usuarios = JSON.parse(usuariosJson);
        
        return usuarios;
    } catch (error) {
        console.error('Error al cargar los usuarios desde el archivo JSON:', error);
        return []; // Retorna un arreglo vacío en caso de error
    }
}
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
        // Obtener la lista de archivos PDF en la carpeta 'publico'
        const fileNames = fs.readdirSync('publico').filter(file => file.endsWith('.pdf'));

        
        // Procesa cada archivo de la lista
        for (let fileName of fileNames) {
            const filePath = `publico/${fileName}`;
            const filePathVerify = `Doc_firmado/${fileName.split('.pdf')[0]}_Firmado.pdf`; // Nombre del archivo firmado
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
                visual: { background: await fsPromises.readFile('mylogo.jpg'), rectangle: { left: 0, top: 720, right: 400, bottom: 820 } }
            };
            const signedPdf = await pdfSigner.signAsync(pdfBytes, info);
            await fsPromises.writeFile(filePathVerify, signedPdf);
            console.log(`El PDF ${fileName} ha sido firmado correctamente en la última página.`);
        }
        res.status(200).send({ message: 'Los documentos han sido firmados con éxito' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send({ error: 'Ocurrió un error al firmar los PDFs' });
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
        res.send('¡Firma Generada Exitosamente, Firme el Documento!');
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
                font-size: 15px;
                text-align: right;
            }
            .info {
                
                width: 350px; 
                height: 80px;  
                padding: 10px;
                margin: 40px auto;
                border: 1px solid #000;
                text-align: center;
            }
        </style>
    </head>
    <body>
             <div class="info" style="width: 350px; height: 100px;">
            <p><strong></strong> ${nombre}</p>
            <p><strong></strong> ${rut}</p>
            <p><strong></strong> ${email}</p>
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

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/dashboard.html');
});

// POST /login
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    // Aquí deberías autenticar al usuario y verificar las credenciales
    // Si la autenticación es exitosa, puedes responder con un código 200
    // Si la autenticación falla, puedes responder con un código 401 (No autorizado) o 403 (Prohibido)
    // Ejemplo simple:
    if (email === 'usuario@example.com' && password === 'contraseña') {
        // Autenticación exitosa
        req.session.user = email; // Establecer una sesión para indicar que el usuario está autenticado
        res.redirect('/dashboard'); // Redirigir al usuario al dashboard
    } else {
        res.sendStatus(401); // Credenciales incorrectas
    }
});

// POST /solicitar-codigo
app.post('/solicitar-codigo', async (req, res) => {
    const { email } = req.body;
    console.log('Correo electrónico del destinatario:', email);

    // Generar un código de verificación aleatorio de 4 dígitos
    const codigoVerificacion = Math.floor(1000 + Math.random() * 9000);
    console.log(`Código de verificación generado para ${email}: ${codigoVerificacion}`);

    validationCodes.set(email, codigoVerificacion);

    // Aquí deberías enviar el código de verificación al correo electrónico del usuario
    // Puedes utilizar nodemailer u otro servicio para enviar correos electrónicos
    
    const mailOptions = {
        from: 'jose.baez@sosya.cl',
        to: email,
        subject: 'Código de Verificación',
        text: `Su código de verificación es: ${codigoVerificacion}`
    };

    // Enviar el correo electrónico
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error al enviar el correo:', error);
            return res.status(500).send('Error al enviar el correo');
        } else {
            console.log('Correo de verificación enviado:', info.response);
            // Envía una respuesta al cliente indicando que se ha enviado el código de verificación
            res.status(200).send('Código de verificación enviado al correo electrónico.');
        }
    });
});




  //Ruta protegida que requiere código de validación
  app.post('/ruta-protegida', validateCode, (req, res) => {
    res.send('Acceso concedido');
  });

  // Middleware para validar el código de verificación
function validateCode(req, res, next) {
    const { code } = req.body;

    // Busca el correo electrónico asociado al código
    let email;
    for (let [key, value] of validationCodes.entries()) {
        if (value === parseInt(code)) {
            email = key;
            break;
        }
    }

    if (email) {
        // Código válido
        console.log(`Código de verificación válido para el correo electrónico: ${email}`);
        req.session.codigoVerificacionValido = true;
        req.session.email = email;
        next();
        // Elimina el código de validación después de usarlo
        validationCodes.delete(email);
    } else {
        // Código inválido
        console.log('Código de verificación inválido');
        console.log(`El código válido esperado es: ${validationCodes.get(email)}`);
        res.status(401).send('Código de verificación inválido');
    }
}


  // Ruta para mostrar el formulario de solicitud de código
app.get('/solicitar-codigo', (req, res) => {
    res.render('solicitarCodigo'); // Renderizar la vista 'solicitarCodigo.ejs'
});

app.get('/verificar-codigo', (req, res) => {
    res.render('agregarCodigo');
});
/*
app.get('/ruta-protegida', (req, res) => {
    res.send('Esta es una ruta protegida');
});
  */
// Middleware para validar el código de verificación
app.post('/verificar-codigo', (req, res) => {
    const { code } = req.body;

    // Busca el correo electrónico asociado al código
    let email;
    for (let [key, value] of validationCodes.entries()) {
        if (value === parseInt(code)) {
            email = key;
            break;
        }
    }

    if (email) {
        // Código válido
        console.log(`Código de verificación válido para el correo electrónico: ${email}`);
        res.status(200).json({ message: 'Código de verificación válido', email });
        // Elimina el código de validación después de usarlo
        validationCodes.delete(email);
    } else {
        // Código inválido
        console.log('Código de verificación inválido');
        console.log(`El código válido esperado es: ${validationCodes.get(email)}`);
        res.status(401).send('Código de verificación inválido');
    }
});


const dataFilePath = 'data.json';

// Verificar si el archivo JSON existe, de lo contrario, inicializarlo con un array vacío
if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, '[]');
}

// Función para cargar los datos desde el archivo JSON
function cargarDatos() {
    const data = fs.readFileSync(dataFilePath);
    return JSON.parse(data);
}

// Función para guardar los datos en el archivo JSON
function guardarDatos(datos) {
    fs.writeFileSync(dataFilePath, JSON.stringify(datos, null, 2));
}

/// Endpoint para solicitar nombre, apellido, número de teléfono y correo electrónico
app.post('/ValidacionCorreo', (req, res) => {
    const { nombre, apellido, telefono, correo } = req.body;

    // Verificar si se proporcionaron todos los campos requeridos
    if (!nombre || !apellido || !telefono || !correo) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    // Configurar las opciones del correo electrónico
    const mailOptions = {
        from: 'jose.baez@sosya.cl',
        to: correo,
        subject: 'Validación de correo electrónico',
        text: 'Validado correo electrónico con Exito, ingrsar al link para continuar: http://localhost:3000/solicitar-codigo'
    };
    // Enviar el correo electrónico de validación al correo proporcionado
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error al enviar el correo electrónico:', error);
            return res.status(500).json({ error: 'Error al enviar el correo electrónico' });
        } else {
            console.log('Correo electrónico enviado:', info.response);

            // Cargar los datos actuales del archivo JSON
            const datosActuales = cargarDatos();

            // Generar un nuevo ID incrementado
            const nuevoId = datosActuales.length > 0 ? datosActuales[datosActuales.length - 1].id + 1 : 1;

            // Agregar los nuevos datos al array
            const nuevosDatos = [...datosActuales, { id: nuevoId, nombre, apellido, telefono, correo }];

            // Guardar los datos actualizados en el archivo JSON
            guardarDatos(nuevosDatos);

            return res.status(200).json({ message: 'Correo electrónico de validación enviado con Exito' });
        }
    });
});



app.get('/ValidacionCorreo', (req, res) => {
    res.render('ValidacionCorreo'); // Renderizar la vista del formulario de registro
});

// Ruta para obtener la lista de archivos PDF en la carpeta 'publico'
app.get('/lista-pdf', (req, res) => {
    const directorio = path.join(__dirname, 'publico');
    fs.readdir(directorio, (err, files) => {
        if (err) {
            console.error('Error al leer el directorio:', err);
            res.status(500).json({ error: 'Error al obtener la lista de archivos PDF' });
        } else {
            const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');
            res.json(pdfFiles);
        }
    });
});






// Puerto en el que se ejecutará el servidor
const PORT = process.env.PORT || 3000;

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
