const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); 

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error(err.message);
    console.log('Conectado a SQLite.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, name TEXT, avatar TEXT, color TEXT, avatar_url TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, author TEXT, avatar TEXT, color TEXT, avatar_url TEXT, content TEXT, media_url TEXT, media_type TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        likes TEXT DEFAULT '[]', comments TEXT DEFAULT '[]', favorites TEXT DEFAULT '[]'
    )`);
});

// --- RUTAS DE USUARIOS ---
app.post('/api/register', (req, res) => {
    const { username, password, name, avatar, color } = req.body;
    db.run(`INSERT INTO users (username, password, name, avatar, color) VALUES (?, ?, ?, ?, ?)`, 
    [username, password, name, avatar, color], function(err) {
        if (err) return res.status(400).json({ error: "El usuario ya existe" });
        res.json({ success: true });
    });
});

app.post('/api/login', (req, res) => {
    db.get(`SELECT id, username, name, avatar, color, avatar_url FROM users WHERE username = ? AND password = ?`, 
    [req.body.username, req.body.password], (err, row) => {
        if (row) res.json({ success: true, user: row });
        else res.status(401).json({ error: "Datos incorrectos" });
    });
});

// --- SUBIR FOTO DE PERFIL ---
app.post('/api/user/avatar', upload.single('avatar'), (req, res) => {
    const media_url = '/uploads/' + req.file.filename;
    const username = req.body.username;
    
    // Actualizar foto en el perfil del usuario
    db.run(`UPDATE users SET avatar_url = ? WHERE username = ?`, [media_url, username], () => {
        // Actualizar foto en todos sus posts anteriores
        db.run(`UPDATE posts SET avatar_url = ? WHERE username = ?`, [media_url, username], () => {
            res.json({ success: true, avatar_url: media_url });
        });
    });
});

// --- RUTAS DE POSTS E INTERACCIONES ---
app.post('/api/posts', upload.single('media'), (req, res) => {
    const { username, author, avatar, color, avatar_url, content } = req.body;
    let media_url = null, media_type = null;
    if (req.file) {
        media_url = '/uploads/' + req.file.filename;
        media_type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
    }
    db.run(`INSERT INTO posts (username, author, avatar, color, avatar_url, content, media_url, media_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
    [username, author, avatar, color, avatar_url, content, media_url, media_type], () => {
        res.json({ success: true });
    });
});

app.get('/api/posts', (req, res) => {
    db.all(`SELECT * FROM posts ORDER BY timestamp DESC`, [], (err, rows) => res.json(rows));
});

// Ruta unificada para likes, favoritos y comentarios
app.post('/api/posts/:id/interact', (req, res) => {
    const { type, username, comment } = req.body; 
    db.get(`SELECT likes, favorites, comments FROM posts WHERE id = ?`, [req.params.id], (err, row) => {
        if(!row) return res.status(404).json({error: "Post no encontrado"});
        
        if (type === 'like' || type === 'favorite') {
            const col = type + 's';
            let arr = JSON.parse(row[col] || '[]');
            if (arr.includes(username)) arr = arr.filter(u => u !== username); // Quitar
            else arr.push(username); // Poner
            db.run(`UPDATE posts SET ${col} = ? WHERE id = ?`, [JSON.stringify(arr), req.params.id], () => res.json({success: true}));
        } else if (type === 'comment') {
            let arr = JSON.parse(row.comments || '[]');
            arr.push(comment);
            db.run(`UPDATE posts SET comments = ? WHERE id = ?`, [JSON.stringify(arr), req.params.id], () => res.json({success: true}));
        }
    });
});

app.listen(3000, () => console.log('Servidor en http://localhost:3000'));