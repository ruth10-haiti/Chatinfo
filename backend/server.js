const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'votre_secret_super_securise_2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Configuration multer pour les images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Seules les images sont autorisées'));
    }
});

// Chemin de la base de données
const DB_PATH = path.join(__dirname, 'database.json');

// Initialiser la base de données
async function initDB() {
    try {
        await fs.access(DB_PATH);
    } catch {
        const initialData = {
            users: [],
            posts: [],
            comments: [],
            likes: [],
            nextIds: {
                user: 1,
                post: 1,
                comment: 1,
                like: 1
            }
        };
        await fs.writeFile(DB_PATH, JSON.stringify(initialData, null, 2));
    }
}

// Lire la base de données
async function readDB() {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    return JSON.parse(data);
}

// Écrire dans la base de données
async function writeDB(data) {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

// Middleware d'authentification
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token invalide' });
        }
        req.user = user;
        next();
    });
}

// ============ ROUTES AUTH ============

// Inscription
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, fullName } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }
        
        const db = await readDB();
        
        // Vérifier si l'utilisateur existe déjà
        if (db.users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Email déjà utilisé' });
        }
        
        if (db.users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
        }
        
        // Hasher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = {
            id: db.nextIds.user++,
            username,
            email,
            password: hashedPassword,
            fullName: fullName || username,
            bio: '',
            avatar: null,
            createdAt: new Date().toISOString(),
            followers: [],
            following: []
        };
        
        db.users.push(newUser);
        await writeDB(db);
        
        // Générer le token
        const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET);
        
        // Ne pas renvoyer le mot de passe
        const { password: _, ...userWithoutPassword } = newUser;
        res.status(201).json({ user: userWithoutPassword, token });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Connexion
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const db = await readDB();
        const user = db.users.find(u => u.email === email);
        
        if (!user) {
            return res.status(400).json({ error: 'Email ou mot de passe incorrect' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(400).json({ error: 'Email ou mot de passe incorrect' });
        }
        
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
        
        const { password: _, ...userWithoutPassword } = user;
        res.json({ user: userWithoutPassword, token });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============ ROUTES POSTS ============

// Créer un post (avec image)
app.post('/api/posts', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({ error: 'Le contenu est requis' });
        }
        
        const db = await readDB();
        
        const newPost = {
            id: db.nextIds.post++,
            userId: req.user.id,
            content,
            image: req.file ? `/uploads/${req.file.filename}` : null,
            createdAt: new Date().toISOString(),
            likesCount: 0,
            commentsCount: 0
        };
        
        db.posts.push(newPost);
        await writeDB(db);
        
        // Ajouter les infos utilisateur
        const user = db.users.find(u => u.id === req.user.id);
        const postWithUser = { ...newPost, user: { username: user.username, fullName: user.fullName, avatar: user.avatar } };
        
        res.status(201).json(postWithUser);
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur lors de la création du post' });
    }
});

// Récupérer tous les posts (fil d'actualité)
app.get('/api/posts', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        
        // Récupérer les posts avec les infos utilisateur
        const postsWithUsers = db.posts
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map(post => {
                const user = db.users.find(u => u.id === post.userId);
                const userPosts = db.posts.filter(p => p.userId === post.userId);
                return {
                    ...post,
                    user: {
                        id: user.id,
                        username: user.username,
                        fullName: user.fullName,
                        avatar: user.avatar
                    },
                    isLiked: db.likes.some(like => like.postId === post.id && like.userId === req.user.id)
                };
            });
        
        res.json(postsWithUsers);
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Récupérer un post spécifique
app.get('/api/posts/:id', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const postId = parseInt(req.params.id);
        
        const post = db.posts.find(p => p.id === postId);
        
        if (!post) {
            return res.status(404).json({ error: 'Post non trouvé' });
        }
        
        const user = db.users.find(u => u.id === post.userId);
        const comments = db.comments
            .filter(c => c.postId === postId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map(comment => {
                const commentUser = db.users.find(u => u.id === comment.userId);
                return {
                    ...comment,
                    user: { username: commentUser.username, fullName: commentUser.fullName, avatar: commentUser.avatar }
                };
            });
        
        const postWithDetails = {
            ...post,
            user: { username: user.username, fullName: user.fullName, avatar: user.avatar },
            comments,
            isLiked: db.likes.some(like => like.postId === postId && like.userId === req.user.id)
        };
        
        res.json(postWithDetails);
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Supprimer un post
app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const postId = parseInt(req.params.id);
        
        const postIndex = db.posts.findIndex(p => p.id === postId);
        
        if (postIndex === -1) {
            return res.status(404).json({ error: 'Post non trouvé' });
        }
        
        const post = db.posts[postIndex];
        
        if (post.userId !== req.user.id) {
            return res.status(403).json({ error: 'Vous ne pouvez pas supprimer ce post' });
        }
        
        // Supprimer les likes et commentaires associés
        db.posts.splice(postIndex, 1);
        db.comments = db.comments.filter(c => c.postId !== postId);
        db.likes = db.likes.filter(l => l.postId !== postId);
        
        await writeDB(db);
        res.json({ message: 'Post supprimé avec succès' });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============ ROUTES LIKES ============

// Liker/Unliker un post
app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const postId = parseInt(req.params.id);
        const userId = req.user.id;
        
        const existingLike = db.likes.find(l => l.postId === postId && l.userId === userId);
        
        if (existingLike) {
            // Unlike
            db.likes = db.likes.filter(l => !(l.postId === postId && l.userId === userId));
            const post = db.posts.find(p => p.id === postId);
            post.likesCount--;
            await writeDB(db);
            res.json({ liked: false, likesCount: post.likesCount });
        } else {
            // Like
            const newLike = {
                id: db.nextIds.like++,
                postId,
                userId,
                createdAt: new Date().toISOString()
            };
            db.likes.push(newLike);
            const post = db.posts.find(p => p.id === postId);
            post.likesCount++;
            await writeDB(db);
            res.json({ liked: true, likesCount: post.likesCount });
        }
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============ ROUTES COMMENTS ============

// Ajouter un commentaire
app.post('/api/posts/:id/comments', authenticateToken, async (req, res) => {
    try {
        const { content } = req.body;
        const postId = parseInt(req.params.id);
        
        if (!content) {
            return res.status(400).json({ error: 'Le commentaire ne peut pas être vide' });
        }
        
        const db = await readDB();
        
        const newComment = {
            id: db.nextIds.comment++,
            postId,
            userId: req.user.id,
            content,
            createdAt: new Date().toISOString()
        };
        
        db.comments.push(newComment);
        
        const post = db.posts.find(p => p.id === postId);
        post.commentsCount++;
        
        await writeDB(db);
        
        const user = db.users.find(u => u.id === req.user.id);
        const commentWithUser = {
            ...newComment,
            user: { username: user.username, fullName: user.fullName, avatar: user.avatar }
        };
        
        res.status(201).json(commentWithUser);
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Supprimer un commentaire
app.delete('/api/comments/:id', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const commentId = parseInt(req.params.id);
        
        const commentIndex = db.comments.findIndex(c => c.id === commentId);
        
        if (commentIndex === -1) {
            return res.status(404).json({ error: 'Commentaire non trouvé' });
        }
        
        const comment = db.comments[commentIndex];
        
        if (comment.userId !== req.user.id) {
            return res.status(403).json({ error: 'Vous ne pouvez pas supprimer ce commentaire' });
        }
        
        db.comments.splice(commentIndex, 1);
        
        const post = db.posts.find(p => p.id === comment.postId);
        if (post) {
            post.commentsCount--;
        }
        
        await writeDB(db);
        res.json({ message: 'Commentaire supprimé' });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============ ROUTES USERS ============

// Récupérer le profil utilisateur
app.get('/api/users/:id', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const userId = parseInt(req.params.id);
        
        const user = db.users.find(u => u.id === userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        const userPosts = db.posts
            .filter(p => p.userId === userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map(post => ({
                ...post,
                isLiked: db.likes.some(like => like.postId === post.id && like.userId === req.user.id)
            }));
        
        const { password, ...userWithoutPassword } = user;
        
        res.json({
            ...userWithoutPassword,
            posts: userPosts,
            postsCount: userPosts.length,
            followersCount: user.followers.length,
            followingCount: user.following.length
        });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Mettre à jour le profil
app.put('/api/users/:id', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (userId !== req.user.id) {
            return res.status(403).json({ error: 'Vous ne pouvez pas modifier ce profil' });
        }
        
        const db = await readDB();
        const userIndex = db.users.findIndex(u => u.id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        const { fullName, bio } = req.body;
        
        if (fullName) db.users[userIndex].fullName = fullName;
        if (bio) db.users[userIndex].bio = bio;
        if (req.file) db.users[userIndex].avatar = `/uploads/${req.file.filename}`;
        
        await writeDB(db);
        
        const { password, ...userWithoutPassword } = db.users[userIndex];
        res.json(userWithoutPassword);
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Suivre/Ne plus suivre un utilisateur
app.post('/api/users/:id/follow', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const userIdToFollow = parseInt(req.params.id);
        const currentUserId = req.user.id;
        
        if (userIdToFollow === currentUserId) {
            return res.status(400).json({ error: 'Vous ne pouvez pas vous suivre vous-même' });
        }
        
        const userToFollow = db.users.find(u => u.id === userIdToFollow);
        
        if (!userToFollow) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        const currentUser = db.users.find(u => u.id === currentUserId);
        
        const isFollowing = currentUser.following.includes(userIdToFollow);
        
        if (isFollowing) {
            // Unfollow
            currentUser.following = currentUser.following.filter(id => id !== userIdToFollow);
            userToFollow.followers = userToFollow.followers.filter(id => id !== currentUserId);
        } else {
            // Follow
            currentUser.following.push(userIdToFollow);
            userToFollow.followers.push(currentUserId);
        }
        
        await writeDB(db);
        
        res.json({ 
            following: !isFollowing,
            followersCount: userToFollow.followers.length
        });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Démarrer le serveur
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`✅ Serveur SocialConnect démarré sur http://localhost:${PORT}`);
        console.log(`📁 Uploads: ${path.join(__dirname, '../uploads')}`);
    });
});