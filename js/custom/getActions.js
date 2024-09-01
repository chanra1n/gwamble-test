// GET local username - get the username of the user that's currently signed in.
function getLocalUsername(token) {
    return JSON.parse(localStorage.getItem('gwambleUser'))?.username;
}

// SET local username - set the username of the user that's currently signed in.
function setLocalUsername(username) {
    var user = JSON.parse(localStorage.getItem('gwambleUser'));
    user.username = username;
    localStorage.setItem('gwambleUser', JSON.stringify(user));
    return "Username updated";
}

// GET username from database - get the username that's associated with the passed token.
function getDBUsername(token) {
    return fakeUserDB.find(user => user.token === token).name;
}

// SET username in database - set the username that's associated with the passed token.
function setDBUsername(token, username) {
    fakeUserDB.find(user => user.token === token).name = username;
    return "Username updated";
}

// GET local user token - get the token of the user that's currently signed in.
function getLocalUserToken() {
    return JSON.parse(localStorage.getItem('gwambleUser'))?.token;
}

// SET local user token - set the token of the user that's currently signed in.
function setLocalUserToken() {
    var user = JSON.parse(localStorage.getItem('gwambleUser'));
    var token = generateUserToken();
    user.token = token;
    localStorage.setItem('gwambleUser', JSON.stringify(user));
    return "token updated to " + token;
}

// GET token from database - get the token that's associated with the passed username.
function getDBUserToken(username) {
    return fakeUserDB.find(user => user.name === getLocalUsername()).token;
}

// SET token in database - set the token that's associated with the passed username.
function setDBUserToken(username, token) {
    var newToken = generateUserToken();
    fakeUserDB.find(user => user.name === username).token = newToken;
    return "token updated to " + newToken;
}

// GET local user coins - get the coins of the user that's currently signed in.
function getLocalUserCoins() {
    return JSON.parse(localStorage.getItem('gwambleUser'))?.coins;
}

// SET local user coins - set the coins of the user that's currently signed in.
function setLocalUserCoins(coins) {
    var user = JSON.parse(localStorage.getItem('gwambleUser'));
    user.coins = coins;
    localStorage.setItem('gwambleUser', JSON.stringify(user));
    return "Coins updated";
}

// GET coins from database - get the coins that's associated with the passed token.
function getDBUserCoins(token) {
    return fakeUserDB.find(user => user.token === token).coins;
}

// SET coins in database - set the coins that's associated with the passed token.
function setDBUserCoins(token, coins) {
    fakeUserDB.find(user => user.token === token).coins = coins;
    return "Coins updated";
}

function generateUserToken() {
    return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
}

function generateSessionID() {
    return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
}