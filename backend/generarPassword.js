const bcrypt = require('bcrypt');
bcrypt.hash('Exotic2026', 10).then(hash => console.log(hash));