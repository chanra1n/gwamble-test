function getLocalUsername(token) {
    return JSON.parse(localStorage.getItem('gwambleUser'))?.username;
}

function getDBUsername(token) {
    return fakeUserDB.find(user => user.token === token).name;
}

function getLocalUserToken() {
    return JSON.parse(localStorage.getItem('gwambleUser'))?.token;
}

function getDBUserToken(username) {
    return fakeUserDB.find(user => user.name === getLocalUsername()).token;
}

function getLocalUserCoins() {
    return JSON.parse(localStorage.getItem('gwambleUser'))?.coins;
}

function getDBUserCoins(token) {
    return fakeUserDB.find(user => user.token === token).coins;
}

function generateSessionID() {
    return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
}