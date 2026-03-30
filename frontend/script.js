const API_URL = 'http://localhost:3000/api';
let currentUser = null;

// Vérifier l'authentification
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    currentUser = user;
    return true;
}

// Charger les données
async function loadData() {
    await loadProfileSidebar();
    await loadPosts();
}

// Charger le profil dans la sidebar
async function loadProfileSidebar() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_URL}/users/${currentUser.id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const userData = await response.json();
        
        document.getElementById('sidebarProfile').innerHTML = `
            <div style="text-align: center">
                ${userData.avatar ? 
                    `<img src="${API_URL}${userData.avatar}" class="profile-avatar" alt="Avatar">` :
                    `<div class="profile-avatar" style="background: #667eea; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                        <span style="font-size: 2rem; color: white">${userData.fullName?.charAt(0) || userData.username.charAt(0)}</span>
                     </div>`
                }
                <h3 class="profile-name">${userData.fullName}</h3>
                <p class="profile-username">@${userData.username}</p>
                <p class="profile-bio">${userData.bio || 'Aucune bio pour le moment'}</p>
            </div>
        `;
        
        document.getElementById('statPosts').textContent = userData.postsCount || 0;
        document.getElementById('statFollowers').textContent = userData.followersCount || 0;
        document.getElementById('statFollowing').textContent = userData.followingCount || 0;
        
    } catch (error) {
        console.error('Erreur chargement profil:', error);
    }
}

// Charger les posts
async function loadPosts() {
    try {
        const response = await fetch(`${API_URL}/posts`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const posts = await response.json();
        displayPosts(posts);
        
    } catch (error) {
        console.error('Erreur chargement posts:', error);
        document.getElementById('postsList').innerHTML = '<div class="loading">❌ Erreur de chargement</div>';
    }
}

// Afficher les posts
function displayPosts(posts) {
    const postsList = document.getElementById('postsList');
    
    if (posts.length === 0) {
        postsList.innerHTML = '<div class="loading">📝 Aucun post pour le moment. Soyez le premier à publier !</div>';
        return;
    }
    
    postsList.innerHTML = posts.map(post => `
        <div class="post-card" data-post-id="${post.id}">
            <div class="post-header">
                ${post.user.avatar ? 
                    `<img src="${API_URL}${post.user.avatar}" class="post-avatar" alt="Avatar">` :
                    `<div class="post-avatar" style="background: #667eea; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white">${post.user.fullName?.charAt(0) || post.user.username.charAt(0)}</span>
                     </div>`
                }
                <div class="post-user-info">
                    <div class="post-username">${post.user.fullName || post.user.username}</div>
                    <div class="post-fullname">@${post.user.username}</div>
                </div>
                <div class="post-time">${formatDate(post.createdAt)}</div>
            </div>
            <div class="post-content">${escapeHtml(post.content)}</div>
            ${post.image ? `<img src="${API_URL}${post.image}" class="post-image" alt="Post image">` : ''}
            <div class="post-actions-bar">
                <button class="action-btn ${post.isLiked ? 'liked' : ''}" onclick="toggleLike(${post.id})">
                    ❤️ ${post.likesCount || 0}
                </button>
                <button class="action-btn" onclick="toggleComments(${post.id})">
                    💬 ${post.commentsCount || 0} commentaires
                </button>
            </div>
            <div class="comments-section" id="comments-${post.id}" style="display: none">
                <div id="comments-list-${post.id}"></div>
                <div class="add-comment">
                    <input type="text" id="comment-input-${post.id}" placeholder="Écrire un commentaire...">
                    <button onclick="addComment(${post.id})">Envoyer</button>
                </div>
            </div>
        </div>
    `).join('');
}

// Ajouter un post
document.getElementById('postForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const content = document.getElementById('postContent').value;
    const imageFile = document.getElementById('postImage').files[0];
    
    if (!content && !imageFile) {
        alert('Veuillez écrire quelque chose ou ajouter une image');
        return;
    }
    
    const formData = new FormData();
    formData.append('content', content);
    if (imageFile) formData.append('image', imageFile);
    
    try {
        const response = await fetch(`${API_URL}/posts`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });
        
        if (response.ok) {
            document.getElementById('postContent').value = '';
            document.getElementById('postImage').value = '';
            loadPosts();
        } else {
            const error = await response.json();
            alert(error.error);
        }
    } catch (error) {
        alert('Erreur lors de la publication');
    }
});

// Liker/Unliker un post
async function toggleLike(postId) {
    try {
        const response = await fetch(`${API_URL}/posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (response.ok) {
            loadPosts();
        }
    } catch (error) {
        console.error('Erreur:', error);
    }
}

// Ajouter un commentaire
async function addComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input.value.trim();
    
    if (!content) return;
    
    try {
        const response = await fetch(`${API_URL}/posts/${postId}/comments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });
        
        if (response.ok) {
            input.value = '';
            loadComments(postId);
        }
    } catch (error) {
        console.error('Erreur:', error);
    }
}

// Charger les commentaires
async function loadComments(postId) {
    try {
        const response = await fetch(`${API_URL}/posts/${postId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const post = await response.json();
        const commentsList = document.getElementById(`comments-list-${postId}`);
        
        if (post.comments && post.comments.length > 0) {
            commentsList.innerHTML = post.comments.map(comment => `
                <div class="comment">
                    <img src="${API_URL}${comment.user.avatar || ''}" class="comment-avatar" onerror="this.src='https://via.placeholder.com/32'">
                    <div class="comment-content">
                        <div class="comment-username">${comment.user.fullName || comment.user.username}</div>
                        <div class="comment-text">${escapeHtml(comment.content)}</div>
                    </div>
                </div>
            `).join('');
        } else {
            commentsList.innerHTML = '<div style="text-align: center; color: #999; padding: 10px">Aucun commentaire</div>';
        }
        
    } catch (error) {
        console.error('Erreur:', error);
    }
}

// Toggle comment section
async function toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    
    if (section.style.display === 'none') {
        section.style.display = 'block';
        await loadComments(postId);
    } else {
        section.style.display = 'none';
    }
}

// Déconnexion
document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'login.html';
});

// Utilitaires
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'à l\'instant';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return date.toLocaleDateString('fr-FR');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialisation
if (window.location.pathname.includes('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/')) {
    if (checkAuth()) {
        loadData();
    }
}