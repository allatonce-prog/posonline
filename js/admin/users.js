// User Management Logic

// Load users
async function loadUsers() {
    const users = await db.getAll('users');
    const tbody = document.getElementById('usersTable');

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No users found</td></tr>';
        return;
    }

    // Sort by username
    const sortedUsers = users.sort((a, b) => a.username.localeCompare(b.username));

    // Get current user to prevent deleting self
    const currentUser = auth.getCurrentUser();

    tbody.innerHTML = sortedUsers.map(user => {
        const isSelf = user.username === currentUser.username;
        const roleBadge = user.role === 'admin' ? 'badge-primary' : 'badge-secondary';
        const dateCreated = user._createdAt ? formatDateTime(user._createdAt) : 'N/A';

        return `
            <tr>
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.name || '')}</td>
                <td><span class="badge ${roleBadge}">${user.role.toUpperCase()}</span></td>
                <td>${dateCreated}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn btn-sm btn-secondary btn-icon" onclick="editUser('${user.id}')" title="Edit">
                            ✏️
                        </button>
                        ${!isSelf ? `
                        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteUser('${user.id}')" title="Delete">
                            🗑️
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Show Add User Modal
function showAddUserModal() {
    document.getElementById('userModalTitle').textContent = 'Add User';
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('passwordHint').style.display = 'none';
    document.getElementById('userUsername').disabled = false;
    document.getElementById('userPassword').required = true;
    document.getElementById('userModal').classList.add('active');
}

// Edit User
async function editUser(id) {
    const user = await db.get('users', id);
    if (!user) {
        showToast('User not found', 'error');
        return;
    }

    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('userId').value = user.id;
    document.getElementById('userUsername').value = user.username;
    // Allow changing username
    document.getElementById('userUsername').disabled = false;
    document.getElementById('userFullName').value = user.name || '';
    document.getElementById('userRole').value = user.role;

    // Password is optional during edit
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').required = false;
    document.getElementById('passwordHint').style.display = 'inline';

    document.getElementById('userModal').classList.add('active');
}

// Save User
async function saveUser() {
    const id = document.getElementById('userId').value;
    const username = document.getElementById('userUsername').value.trim();
    const name = document.getElementById('userFullName').value.trim();
    const role = document.getElementById('userRole').value;
    const password = document.getElementById('userPassword').value;

    if (!username || !name || !role) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }

    if (!id && !password) {
        showToast('Password is required for new users', 'warning');
        return;
    }

    showLoading('Saving user...');

    try {
        if (id) {
            // Update existing user
            const user = await db.get('users', id);

            // Check username uniqueness if changed
            if (username !== user.username) {
                const existing = await db.getByIndex('users', 'username', username);
                if (existing && existing.id !== id) {
                    hideLoading();
                    showToast('Username already exists', 'error');
                    return;
                }
                user.username = username;
            }

            // Only update password if provided
            if (password) {
                user.password = await db.hashPassword(password);
            }

            user.name = name;
            user.role = role;

            await db.update('users', user);

            // Update session if editing self
            const currentUser = auth.getCurrentUser();
            if (currentUser && currentUser.id === id) {
                const sessionUpdate = {
                    ...currentUser,
                    username: user.username,
                    name: user.name,
                    role: user.role
                };
                auth.saveSession(sessionUpdate);

                // Update UI name
                const adminNameEl = document.getElementById('adminName');
                if (adminNameEl) adminNameEl.textContent = user.name || user.username;
            }

            showToast('User updated successfully', 'success');
        } else {
            // Create new user

            // Check if username exists
            const existing = await db.getByIndex('users', 'username', username);
            if (existing) {
                hideLoading();
                showToast('Username already exists', 'error');
                return;
            }

            const hashedPassword = await db.hashPassword(password);

            // Get current user's storeId to assign to the new user
            const currentUser = auth.getCurrentUser();
            const storeId = currentUser?.storeId || 'default_store';

            await db.add('users', {
                username: username,
                name: name,
                role: role,
                password: hashedPassword,
                storeId: storeId  // ← Add storeId to new user
            });
            showToast('User added successfully', 'success');
        }

        closeUserModal();
        await loadUsers();
        hideLoading();
    } catch (error) {
        hideLoading();
        showToast('Error saving user: ' + error.message, 'error');
    }
}

// Delete User
async function deleteUser(id) {
    if (!confirm('Are you sure you want to delete this user?')) return;

    showLoading('Deleting user...');
    try {
        await db.remove('users', id);
        showToast('User deleted successfully', 'success');
        await loadUsers();
        hideLoading();
    } catch (error) {
        hideLoading();
        showToast('Error deleting user: ' + error.message, 'error');
    }
}

// Close User Modal
function closeUserModal() {
    document.getElementById('userModal').classList.remove('active');
}

// Global scope exposure
window.loadUsers = loadUsers;
window.showAddUserModal = showAddUserModal;
window.editUser = editUser;
window.saveUser = saveUser;
window.deleteUser = deleteUser;
window.closeUserModal = closeUserModal;

// Close modal on outside click
document.addEventListener('click', (e) => {
    if (e.target.id === 'userModal') {
        closeUserModal();
    }
});
