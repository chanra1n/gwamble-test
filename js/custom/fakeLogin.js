var fakeUsername = 'chanra1n';
var fakeUserToken = '0751316083bf1159';
var fakeUserCoins = 100;

function fakeLogin() {
    //create object in localstorage for fake user
    localStorage.setItem('gwambleUser', JSON.stringify({
        username: fakeUsername,
        token: fakeUserToken,
        coins: fakeUserCoins
    }));
}

fakeLogin();
