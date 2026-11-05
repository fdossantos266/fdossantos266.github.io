const canvas = document.getElementById("jeu");
const ctx = canvas.getContext("2d");

const RAYON = 25;

const COULEURS = {
    neutre: "#555555",
    joueur: "#00ff15",
    ia1: "#ff3344",
    ia2: "#ff9933"
};

//positions fixes 
const noeuds =  [
    {id: 0, x: 100, y: 300, proprio: "joueur", puissance: 10},
    { id: 1,  x: 220, y: 180, proprio: "neutre", puissance: 5 },
    { id: 2,  x: 220, y: 420, proprio: "neutre", puissance: 5 },
    { id: 3,  x: 350, y: 100, proprio: "neutre", puissance: 8 },
    { id: 4,  x: 360, y: 300, proprio: "neutre", puissance: 12 },
    { id: 5,  x: 350, y: 500, proprio: "neutre", puissance: 8 },
    { id: 6,  x: 500, y: 200, proprio: "neutre", puissance: 10 },
    { id: 7,  x: 500, y: 400, proprio: "neutre", puissance: 10 },
    { id: 8,  x: 600, y: 300, proprio: "neutre", puissance: 15 },
    { id: 9,  x: 700, y: 100, proprio: "ia1",    puissance: 10 },
    { id: 10, x: 700, y: 500, proprio: "ia2",    puissance: 10 }
];


//lines entre les noeuds 
const liens = [
    [0, 1], [0, 2],
    [1, 3], [1, 4], [2, 4], [2, 5],
    [3, 6], [4, 6], [4, 7], [5, 7],
    [6, 8], [7, 8],
    [3, 9], [6, 9], [8, 9],
    [5, 10], [7, 10], [8, 10]
];

function dessinerLiens() {
    ctx.strokeStyle = "#1f5f3f";
    ctx.lineWidth = 2;

    for (const [a, b] of liens) {
        const n1 = noeuds[a];
        const n2 = noeuds[b];
        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
        ctx.stroke();
    }
}

function dessinerNoeuds() {
    for (const n of noeuds) {
        // Le cercle
        ctx.beginPath();
        ctx.arc(n.x, n.y, RAYON, 0, Math.PI * 2);
        ctx.fillStyle = COULEURS[n.proprio];
        ctx.fill();
        if (n === selection) {
            ctx.strokeStyle = "#ffff00";
            ctx.lineWidth = 5;
        } else if (selection !== null && sontRelies(selection, n)) {
            ctx.strokeStyle = "#33ff99";   // cible possible en vert
            ctx.lineWidth = 3;
        } else {
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
        }
        ctx.stroke();

        // La puissance au centre
        ctx.fillStyle = "white";
        ctx.font = "bold 16px Courier New";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(Math.floor(n.puissance), n.x, n.y);
    }
}

function dessiner() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dessinerLiens();
    dessinerNoeuds();
}

// ===== 5. Mise à jour =====
const CROISSANCE = 1;        // puissance gagnée par seconde
const PUISSANCE_MAX = 99;    // plafond

function mettreAJour(dt) {
    for (const n of noeuds) {
        // Les serveurs neutres ne grandissent pas
        if (n.proprio !== "neutre") {
            n.puissance += CROISSANCE * dt;
            n.puissance = Math.min(n.puissance, PUISSANCE_MAX);
        }
    }
}

// ===== 8. Attaque =====
function sontRelies(a, b) {
    for (const [x, y] of liens) {
        if ((x === a.id && y === b.id) || (x === b.id && y === a.id)) {
            return true;
        }
    }
    return false;
}

function attaquer(source, cible) {
    if (!sontRelies(source, cible)) return;

    const force = Math.floor(source.puissance / 2);
    if (force < 1) return;           // pas assez de puissance pour attaquer

    source.puissance -= force;

    if (cible.proprio === source.proprio) {
        // Renfort entre deux serveurs alliés
        cible.puissance = Math.min(cible.puissance + force, PUISSANCE_MAX);
    } else if (force > cible.puissance) {
        // Victoire : on pirate le serveur
        cible.proprio = source.proprio;
        cible.puissance = force - cible.puissance;
    } else {
        // Échec : on affaiblit la cible
        cible.puissance -= force;
    }
}

// ===== 7. Sélection au clic =====
let selection = null;   // le serveur sélectionné, ou null si aucun

function noeudSousLaSouris(x, y) {
    for (const n of noeuds) {
        const dx = x - n.x;
        const dy = y - n.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= RAYON) {
            return n;
        }
    }
    return null;
}

canvas.addEventListener("click", (event) => {
    // Convertir la position de la souris en coordonnées du canvas
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);

    const n = noeudSousLaSouris(x, y);

       if (n === null) {
        selection = null;
    } else if (selection !== null && n !== selection && sontRelies(selection, n)) {
        attaquer(selection, n);      // attaque ou renfort
        selection = null;
    } else if (n.proprio === "joueur") {
        selection = n;
    }
});

// ===== 6. Boucle de jeu =====
let dernierTemps = performance.now();

function boucle(maintenant) {
    // Temps écoulé depuis la dernière image, en secondes
    const dt = (maintenant - dernierTemps) / 1000;
    dernierTemps = maintenant;

    mettreAJour(dt);
    dessiner();

    requestAnimationFrame(boucle);
}

requestAnimationFrame(boucle);