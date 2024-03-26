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
import { getConnection } from  './database/connection.js';
import os from 'os';
import sql from 'mssql'

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
app.set('view engine', 'ejs');
// Configurar el motor de plantillas EJS
app.set('view engine', 'ejs');





// Configurar middleware de sesiones
app.use(session({
    secret: 'secret_key', // Cambia esto por una clave secreta más segura
    resave: false,
    saveUninitialized: false
}));
app.use(express.json());

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
app.get('/', (_, res) => {
    // Ruta del directorio que contiene los archivos adjuntos
    const directoryPath = path.join(__dirname, 'Doc_firmado');

    // Obtener la IP local del equipo actual
    const ipAddress = getLocalIpAddress();

    // Leer los archivos en el directorio
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            console.error('Error al leer el directorio:', err);
            res.status(500).send('Error al leer el directorio');
            return;
        }

        // Filtrar los archivos que fueron creados con la misma IP
        const filteredFiles = files.filter(file => {
            const fileStats = fs.statSync(path.join(directoryPath, file));
            const fileCreatedByIp = fileStats.birthtimeMs;
            return fileCreatedByIp === ipAddress;
        });

        // Mostrar la lista de archivos adjuntos en la respuesta
        res.render('enviar_correo.ejs', {adjunto : { adjuntos: filteredFiles }});
    });
});

  app.get('/enviar_correoSA', async (req, res) => {
    try {
        // Consultar la tabla Usuarios desde la base de datos
        const pool = await getConnection(); // Configurar la conexión a tu base de datos 

        const result = await pool.request().query('SELECT Correo_Personal FROM Empleado');

        // Verificar que se obtuvieron registros de usuarios
        if (result.recordset.length === 0) {
            return res.status(500).send('No se encontraron usuarios en la base de datos');
        }

        // Obtener los correos personales de los usuarios
        const correos = result.recordset.map(Empleado => Empleado.Correo_Personal);

        // Renderizar la vista 'Enviar_correoSA.ejs' con los datos de correos
        res.render('enviar_correoSA', { correos: correos });
    } catch (error) {
        console.error('Error al obtener los correos de usuarios:', error);
        return res.status(500).send('Error al obtener los correos de usuarios');
    }
});;

/// Ruta para enviar correo a múltiples destinatarios obtenidos de la tabla Empleado
app.post('/enviar_correoSA', async (req, res) => {
    try {
        // Consultar la tabla Empleado desde la base de datos
        const pool = await getConnection(); // Configurar la conexión a tu base de datos 

        const result = await pool.request().query('SELECT Correo_Personal FROM Empleado');

        // Verificar que se obtuvieron registros de empleados
        if (result.recordset.length === 0) {
            return res.status(500).send('No se encontraron empleados en la base de datos');
        }

        // Obtener las direcciones de correo electrónico de los empleados
        const destinatarios = result.recordset.map(Empleado => Empleado.Correo_Personal);

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





// POST /guardar-correo

app.post('/guardar-correo', (req, res) => {
    const { email } = req.body;
    const ip = getLocalIpAddress();

    // Inicializar correoYIP si no está definido en la sesión
    req.session.correoYIP = req.session.correoYIP || {};

    // Almacenar el correo y la IP en la sesión
    req.session.correoYIP.email = correoYIPemail;
    req.session.correoYIP.ip = ip;

    console.log(`Correo guardado correctamente: ${req.session.correoYIP.email}`);
    res.send('Correo guardado correctamente');
});

// POST /enviar-correo
app.post('/enviar-correo', async (req, res) => {
    
    // Obtener el correo y la IP almacenados en la sesión
    const email = req.session.correoYIP.email;
    const ip = req.session.correoYIP.ip;

    if (!email || !ip) {
        return res.status(400).send('No se ha guardado ningún correo previamente.');
    }
    
    // Obtener los datos del formulario
    const { asunto, mensaje } = req.body;

    // Comprobar si la dirección IP coincide
    const localIpAddress = getLocalIpAddress();
    if (localIpAddress !== ip) {
        return res.status(400).send('La dirección IP no coincide.');
    }

    console.log('Solicitud POST recibida. Datos del formulario:');
    console.log('Para:', email);
    console.log('Asunto:', asunto);
    console.log('Mensaje:', mensaje);

    // Ruta de la carpeta que contiene los documentos firmados
    const folderPath = path.join(__dirname, 'Doc_firmado');

    // Leer los archivos de la carpeta y enviarlos como adjuntos en el correo electrónico
    fs.readdir(folderPath, async (err, files) => {
        if (err) {
            console.error('Error al leer la carpeta de documentos firmados:', err);
            res.status(500).send('Error al leer la carpeta de documentos firmados');
            return;
        }

        console.log('Archivos encontrados en la carpeta de documentos firmados:', files);

        try {
            // Configurar las opciones del correo electrónico
            const mailOptions = {
                from: 'jose.baez@sosya.cl',
                to: email,
                subject: 'Documentos Firmados',
                html: `<p>${mensaje}</p><p>Adjunto encontrarás el archivo: ContratoFirmado.pdf</p>`,
                attachments: files.map(file => ({
                    filename: file,
                    path: path.join(folderPath, file)
                })),
                bcc: 'alexyose09@gmail.com'
            };

            console.log('Opciones del correo electrónico:', mailOptions);

            // Enviar el correo electrónico
            const info = await transporter.sendMail(mailOptions);
            console.log('Correo enviado:', info.response);

            
            // Enviar respuesta de éxito
            res.send('Correo enviado correctamente');
        } catch (error) {
            console.error('Error al enviar el correo:', error);
            res.status(500).send('Error al enviar el correo');
        }
    });
});



// Función para obtener la dirección IP local del equipo actual
function getLocalIpAddress() {
    const ifaces = os.networkInterfaces();
    let ipAddress = '';

    Object.keys(ifaces).forEach(ifname => {
        ifaces[ifname].forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) {
                ipAddress = iface.address;
            }
        });
    });

    return ipAddress;
}


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


let nombreFormulario = '';
let correoYIPemail = "";

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


    nombreFormulario = nombre;
    correoYIPemail = email;
    // Convertir el formulario a imagen
    try {
        const nombreFormulario = await convertirFormulario(nombre, rut, email);
        // Guardar la imagen en el servidor
        
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
    }) 
    
// Obtener la dirección IP del equipo
const ipAddress = getLocalIPAddress();
console.log('Dirección IP:', ipAddress); // Mostrar la dirección IP por consola

// Generar el nombre de la imagen con la dirección IP
const imageName = `Firma_${ipAddress.replace(/\./g, '_')}_${nombre}.jpg`;


    
    // Guardar la imagen en el directorio de imágenes
    fs.writeFileSync(`Uploads/${imageName}`, imageBuffer);
    // Guardar una copia de la imagen en el directorio raíz con el nombre "mylogo.jpg"
    fs.writeFileSync(`mylogo.jpg`, imageBuffer);


    // Guardar los datos en la base de datos
    const pool = await getConnection();
    const query = `
        INSERT INTO Firma (Nombre, Rut, Correo, Imagen)
        VALUES ('${nombre}', '${rut}', '${email}', '${imageName}')
    `;
    await pool.request().query(query);
    
    // Devolver el nombre de la imagen generada
    return imageName;
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


function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const interfaceName of Object.keys(interfaces)) {
        for (const iface of interfaces[interfaceName]) {
            // Filtrar direcciones IPv4 privadas
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'No se pudo obtener la dirección IP';
}


// POST /firmar-pdf
app.post('/firmar-pdf', upload.none(), async (req, res) => {
    try {
        // Obtener la lista de archivos PDF en la carpeta 'publico'
        const fileNames = fs.readdirSync('publico').filter(file => file.endsWith('.pdf'));

        // Obtener la última dirección IP utilizada
        const lastIPAddress = getLocalIPAddress();

        // Variable para verificar si hubo un error durante el proceso de firma de los PDF
        let errorOccurred = false;

        // Procesa cada archivo de la lista
        for (let fileName of fileNames) {
            console.log('Nombre del formulario:', nombreFormulario); // Acceder al nombre del formulario aquí
            const filePath = `publico/${fileName}`;
            const nombre = fileName.split('.pdf')[0]; // Nombre original del archivo PDF
            const filePathVerify = `Doc_firmado/${nombre}_${nombreFormulario}_Firmado.pdf`; // Nombre del archivo firmado
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
                visual: { background: await fsPromises.readFile(`Uploads/Firma_${lastIPAddress.replace(/\./g, '_')}_${nombreFormulario}.jpg`), rectangle: { left: 0, top: 720, right: 400, bottom: 820 } }
            };

            const signedPdf = await pdfSigner.signAsync(pdfBytes, info);
            await fsPromises.writeFile(filePathVerify, signedPdf);
            console.log(`El PDF ${fileName} ha sido firmado correctamente en la última página.`);

            // Insertar datos en la tabla Documento de la base de datos
            const pool = await getConnection(); // Configurar la conexión a tu base de datos
            const query = `
                INSERT INTO Documento (Nombre_Documento, TipoDocumento, Cantidad, Ruta, Fecha_Firma, Emisor_id, Empleado_id)
                VALUES ('${filePathVerify}', 'PDF', 1, '${filePathVerify}', GETDATE(), null, null)
            `;
            await pool.request().query(query);
        }

        // Si no hubo errores durante el proceso, enviar respuesta exitosa al cliente
        if (!errorOccurred) {
            res.status(200).send({ message: 'Los documentos han sido firmados con éxito' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send({ error: 'Ocurrió un error al firmar los PDFs' });
    }
});

// Empleados
let empleados = [];



app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/dashboard.html');
});



// POST /login: Validar las credenciales de inicio de sesión
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Establecer conexión a la base de datos
        const pool = await getConnection();

        // Consulta SQL para verificar las credenciales del usuario
        const query = `SELECT * FROM Usuario WHERE Correo = @email`;
        const request = pool.request();
        request.input('email', sql.VarChar, email);

        // Ejecutar la consulta SQL
        const result = await request.query(query);

        // Verificar si se encontró un usuario con el correo electrónico proporcionado
        if (result.recordset.length === 0) {
            return res.status(401).send('Correo electrónico no registrado');
        }

        // Comparar la contraseña proporcionada con la contraseña almacenada en la base de datos
        const user = result.recordset[0];
        if (user.Contraseña !== password) {
            return res.status(401).send('Contraseña incorrecta');
        }

        // Las credenciales son válidas, puedes iniciar sesión
        req.session.user = {
            id: user.Usuario_id,
            nombre: user.Nombre_Usuario,
            email: user.Correo
            // Puedes incluir más información del usuario si es necesario
        };

        res.redirect('/perfil'); // Redirigir al perfil del usuario después de iniciar sesión
    } catch (error) {
        console.error('Error al validar las credenciales de inicio de sesión:', error);
        res.status(500).send('Error interno del servidor');
    }
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





// Endpoint para solicitar nombre, apellido, número de teléfono y correo electrónico
app.post('/ValidacionCorreo', async (req, res) => {
    const { nombre, apellido, telefono, correo } = req.body;

    // Verificar si se proporcionaron todos los campos requeridos
    if (!nombre || !apellido || !telefono || !correo) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }
    

    // Establecer conexión a la base de datos
    const pool = await getConnection();

    try {
        // Verificar si se estableció la conexión
        if (pool) {
            // Consulta SQL para insertar datos en la tabla UsuarioVal
            const query = `
               
            
            INSERT INTO [dbo].[UsuarioVal] ([Nombre], [Apellido], [Correo_Empresa], [Telefono])
             VALUES ('${nombre}', '${apellido}', '${correo}', '${telefono}')
             `;
            // Ejecutar la consulta
            await pool.request().query(query);

            
            // Enviar respuesta de éxito
            return res.status(200).json({ message: 'Datos validados con éxito, revise su bandeja de entrada en su correo ingresado' });
        } else {
            // Si la conexión no se estableció, enviar error
            return res.status(500).json({ error: 'Error en la conexión a la base de datos' });
        }
    } catch (error) {
        // Si ocurre algún error durante la consulta, enviar error
        console.error('Error al ejecutar la consulta SQL:', error);
        return res.status(500).json({ error: 'Error al ejecutar la consulta SQL' });
    } finally {
        // Cerrar la conexión a la base de datos
        pool.close();
    

    // Enviar correo electrónico de validación
    const mailOptions = {
        from: 'jose.baez@sosya.cl',
        to: correo,
        subject: 'Código de Verificación',
        text: `¡Tu información ha sido validada con éxito! Puedes acceder a la firma desde el siguiente enlace: http://localhost:3000/solicitar-codigo`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error al enviar el correo de validación:', error);
        } else {
            console.log('Correo de validación enviado:', info.response);
        }
    });
}
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




app.get('/perfil', (req, res) => {
    // Verificar si el usuario está autenticado
    if (!req.session.user) {
        // Si el usuario no está autenticado, redirigirlo al inicio de sesión
        return res.redirect('/login');
    }

    // Renderizar la vista del perfil y pasar los datos del usuario a la plantilla
    res.render('perfil', { user: req.session.user });
});

app.post('/perfil', (req, res) => {
    // Verificar si el usuario está autenticado
    if (!req.session.user) {
        // Si el usuario no está autenticado, redirigirlo al inicio de sesión
        return res.redirect('/login');
    }

    // Supongamos que estás utilizando algún middleware para parsear el cuerpo de la solicitud
    const { nombre, email, newPassword } = req.body;

    // Aquí podrías realizar la lógica para actualizar el perfil del usuario en la base de datos
    // Por simplicidad, aquí solo mostraremos los datos recibidos en la consola
    console.log('Datos del perfil actualizados:');
    console.log('Nombre de usuario:', nombre);
    console.log('Correo electrónico:', email);
    console.log('Nueva contraseña:', newPassword);

    // Actualizar los datos del usuario en la sesión
    req.session.user.username = nombre;
    req.session.user.email = email;

    // Redirigir al usuario de nuevo a la página de perfil
    res.redirect('/perfil');
});


// GET: Renderiza la vista de registro
app.get('/registro', (req, res) => {
    res.render('registro');
});
// Endpoint para registrar un nuevo usuario
app.post('/registro', async (req, res) => {
    // Extraer los datos del formulario de registro
    const { nombre, email, password } = req.body;
  
    try {
      // Obtener el pool de conexión
      const pool = await getConnection();
  
      // Consulta SQL para insertar el nuevo usuario en la base de datos
      const query = `
        INSERT INTO Usuario (Nombre_Usuario, Contraseña, Correo)
        VALUES ('${nombre}', '${password}', '${email}')
      `;
  
      // Ejecutar la consulta SQL para insertar el usuario
      const result = await pool.request().query(query);
      console.log('Nuevo usuario registrado en la base de datos:', result);
  
      res.redirect('/login'); // Redirigir al usuario a la página de inicio de sesión después de registrar
    } catch (error) {
      console.error('Error al registrar el nuevo usuario en la base de datos:', error);
      res.status(500).send('Error interno del servidor');
    }
  });
  


// Puerto en el que se ejecutará el servidor
const PORT = process.env.PORT || 3000;

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});