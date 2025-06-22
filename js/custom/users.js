function initUser() {
    var user = localStorage.getItem('gwambleUser');
    if (user) {
        console.log('User found', JSON.parse(user));
        return;
    }

    var username = prompt("Welcome to Gwamble! Please enter your username:");
    if (username) {
        var userToken = generateUserToken();
        var user = {
            username: username,
            token: userToken,
            credits: 100 // Start with 100 credits
        };
        localStorage.setItem('gwambleUser', JSON.stringify(user));
        console.log('User created', user);
    } else {
        // handle case where user cancels prompt
        alert("You need a username to play!");
        initUser();
    }
}

function generateUserToken() {
    // 12-character alphanumeric (letters and numbers)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

function getLocalUser() {
    return JSON.parse(localStorage.getItem('gwambleUser'));
}

function getLocalUsername() {
    var user = getLocalUser();
    return user ? user.username : 'Guest';
}

function getLocalUserToken() {
    var user = getLocalUser();
    return user ? user.token : null;
}

function getDBUsername(token) {
    // In a real app, this would look up the user in a database.
    // For now, we'll just return a placeholder.
    // This function is used in join.html and session.html
    // to show who hosted the gwamble.
    // Since we don't have a shared user database, we can't resolve
    // the host's username from their token on the joiner's device.
    // We will need to pass the username in the session object.
    return 'a fellow gwambler';
}

function updateUsername(newName) {
    let user = getLocalUser();
    if (user) {
        user.username = newName;
        localStorage.setItem('gwambleUser', JSON.stringify(user));
    }
}

function updateUserCredits(amount) {
    let user = getLocalUser();
    if (user) {
        user.credits += amount;
        localStorage.setItem('gwambleUser', JSON.stringify(user));
    }
}

function getUserId() {
    let user = getLocalUser();
    return user ? user.token : null;
}


window.addEventListener('load', initUser);
