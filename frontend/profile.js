const API_URL = 'http://localhost:3000/api';
let currentUser = null;

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    return true;
}

async function loadProfile() {
    try {
        const response = await fetch(`${API_URL}/users/${currentUser.id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const userData = await response.json();
        displayProfile(userData);
        displayProfilePosts(userData.posts);
        
    } catch (error) {
        console.error('Erreur:', error);
    }
}

function displayProfile(user) {
    const profileHeader = document.getElementById('profileHeader');
    profileHeader.innerHTML = `
        <div class="profile-cover">
            <div class="profile-avatar-large">
                ${user.avatar ? 
                    `<img src="${API_URL}${user.avatar}" alt="Avatar">` :
                    `<div class="avatar-placeholder">${user.fullName?.charAt(0) || user.username.charAt(0)}</div>`
                }
            </div>
            <div class="profile-info">
                <h1>${user.fullName}</h1>
                <p class="profile-username">@${user.username}</p>
                <p class="profile-email">${user.email}</p>
            </div>
        </div>
    `;
    
    document.getElementById('profilePostsCount').textContent = user.postsCount || 0;
    document.getElementById('profileFollowersCount').textContent = user.followersCount || 0;
    document.getElementById('profileFollowingCount').textContent = user.followingCount || 0;
    
    const bioSection = document.getElementById('profileBio');
    bioSection.innerHTML = `
        <h3>📖 Bio</h3>
        <p>${user.bio || 'Aucune bio pour le moment. Cliquez sur modifier pour ajouter une bio.'}</p>
    `;
}

function displayProfilePosts(posts) {
    const postsList = document.getElementById('profilePostsList');
    
    if (!posts || posts.length === 0) {
        postsList.innerHTML = '<div class="loading">📝 Vous n\'avez pas encore de posts</div>';
        return;
    }
    
    postsList.innerHTML = posts.map(post => `
        <div class="post-card">
            <div class="post-header">
                <div class="post-user-info">
                    <div class="post-username">${currentUser.fullName}</div>
                    <div class="post-fullname">@${currentUser.username}</div>
                </div>
                <div class="post-time">${formatDate(post.createdAt)}</div>
            </div>
            <div class="post-content">${escapeHtml(post.content)}</div>
            ${post.image ? `<img src="${API_URL}${post.image}" class="post-image" alt="Post image">` : ''}
            <div class="post-actions-bar">
                <button class="action-btn ${post.isLiked ? 'liked' : ''}" onclick="toggleLike(${post.id})">
                    ❤️ ${post.likesCount || 0}
                </button>
                <button class="action-btn">
                    💬 ${post.commentsCount || 0} commentaires
                </button>
            </div>
        </div>
    `).join('');
}

// Édition du profil
document.getElementById('editProfileBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('editModal');
    modal.style.display = 'flex';
    
    // Remplir le formulaire
    document.getElementById('editFullName').value = currentUser.fullName || '';
    document.getElementById('editBio').value = currentUser.bio || '';
});

document.getElementById('editProfileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('fullName', document.getElementById('editFullName').value);
    formData.append('bio', document.getElementById('editBio').value);
    
    const avatarFile = document.getElementById('editAvatar').files[0];
    if (avatarFile) formData.append('avatar', avatarFile);
    
    try {
        const response = await fetch(`${API_URL}/users/${currentUser.id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });
        
        if (response.ok) {
            const updatedUser = await response.json();
            localStorage.setItem('user', JSON.stringify(updatedUser));
            currentUser = updatedUser;
            document.getElementById('editModal').style.display = 'none';
            loadProfile();
            alert('Profil mis à jour !');
        }
    } catch (error) {
        alert('Erreur lors de la mise à jour');
    }
});

// Fermer le modal
document.querySelector('.close')?.addEventListener('click', () => {
    document.getElementById('editModal').style.display = 'none';
});

// Déconnexion
document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'login.html';
});

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialisation
if (checkAuth()) {
    loadProfile();
}