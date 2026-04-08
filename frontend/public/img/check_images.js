const fs = require('fs');
for (let i = 1; i <= 6; i++) {
    const stat = fs.statSync(`/home/aurora/Documents/Projects/GIT_Personal/SD_jogo-forca/frontend/public/img/cenario-montado-${i}.png`);
    console.log(`cenario-montado-${i}.png: ${stat.size} bytes`);
}
