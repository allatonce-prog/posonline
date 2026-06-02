// User Management Logic
const usersPaginator = new PaginationManager(5);

// Load users
// Load users
async function loadUsers() {
    let users = await db.getAll('users');
    const tbody = document.getElementById('usersTable');
    const activeUsersCountEl = document.getElementById('activeUsersCount');
    const statusFilter = document.getElementById('userStatusFilter')?.value || 'all';

    const now = new Date();
    const currentUser = auth.getCurrentUser();

    // Helper to get status
    const getUserStatus = (user) => {
        if (user.username === currentUser.username) return 'active'; // Self is always active
        if (!user.lastActive) return 'offline';
        const diffMinutes = Math.floor((now - new Date(user.lastActive)) / 60000);
        if (diffMinutes < 5) return 'active';
        if (diffMinutes < 30) return 'away';
        return 'offline';
    };

    // Calculate count of active users
    const activeCount = users.filter(u => getUserStatus(u) === 'active').length;
    if (activeUsersCountEl) activeUsersCountEl.textContent = activeCount;

    // Filter users
    if (statusFilter !== 'all') {
        users = users.filter(u => getUserStatus(u) === statusFilter);
    }

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No users found matching filter</td></tr>';
        const container = document.getElementById('usersPaginationContainer');
        if (container) container.innerHTML = '';
        return;
    }

    // Sort by username
    const sortedUsers = users.sort((a, b) => a.username.localeCompare(b.username));

    // Pagination
    const paginated = usersPaginator.paginate(sortedUsers);
    const displayUsers = paginated.data;



    tbody.innerHTML = displayUsers.map(user => {
        const isSelf = user.username === currentUser.username;
        const roleBadge = user.role === 'admin' ? 'badge-primary' : 'badge-secondary';
        const dateCreated = user._createdAt ? formatDateTime(user._createdAt) : 'N/A';

        // Calculate Activity Status
        let statusHtml = '<span class="status-indicator status-offline"></span> Offline';

        if (isSelf) {
            statusHtml = '<span class="status-indicator status-active"></span> Active Now (You)';
        } else if (user.lastActive) {
            const lastActive = new Date(user.lastActive);
            const diffMinutes = Math.floor((now - lastActive) / 60000);

            if (diffMinutes < 5) {
                statusHtml = '<span class="status-indicator status-active"></span> Active Now';
            } else if (diffMinutes < 30) {
                statusHtml = `<span class="status-indicator status-away"></span> Last seen ${diffMinutes}m ago`;
            } else if (diffMinutes < 60) {
                statusHtml = `<span class="status-indicator status-offline"></span> Last seen ${diffMinutes}m ago`;
            } else {
                const hours = Math.floor(diffMinutes / 60);
                if (hours < 24) {
                    statusHtml = `<span class="status-indicator status-offline"></span> Last seen ${hours}h ago`;
                } else {
                    statusHtml = `<span class="status-indicator status-offline"></span> ${lastActive.toLocaleDateString()}`;
                }
            }
        }

        return `
            <tr>
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.name || '')}</td>
                <td><span class="badge ${roleBadge}">${user.role.toUpperCase()}</span></td>
                <td>${dateCreated}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem;">
                        ${statusHtml}
                    </div>
                </td>
                <td>
                    <div class="action-btns">
                        <button class="btn btn-sm btn-icon" onclick="editUser('${user.id}')" title="Edit" style="background: #f59e0b; color: white; border: none; width: 32px; height: 32px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;">
                            <i class="ph ph-pencil-simple"></i>
                        </button>
                        ${!isSelf ? `
                        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteUser('${user.id}')" title="Delete" style="width: 32px; height: 32px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;">
                            <i class="ph ph-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Pagination Controls
    let paginationContainer = document.getElementById('usersPaginationContainer');
    if (!paginationContainer && tbody) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'usersPaginationContainer';
        tbody.closest('.table-container').appendChild(paginationContainer);
    }

    usersPaginator.renderControls('usersPaginationContainer', paginated.totalPages, (page) => {
        usersPaginator.setPage(page);
        loadUsers();
    });
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
    document.body.classList.add('modal-open');
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
    document.body.classList.add('modal-open');
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
    document.body.classList.remove('modal-open');
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
