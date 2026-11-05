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
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
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

dessiner();