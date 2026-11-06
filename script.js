// ===== 1. Canvas et réglages =====
const canvas = document.getElementById("jeu");
const ctx = canvas.getContext("2d");

const RAYON = 36;
const CROISSANCE = 1;          // puissance gagnée par seconde
const PUISSANCE_MAX = 99;      // plafond
const DELAI_IA = 2;            // secondes entre deux décisions de l'IA
const VITESSE_PAQUET = 150;    // pixels par seconde

// Réglages de la carte aléatoire
const NB_NOEUDS = 14;
const DISTANCE_MIN = 130;      // écart minimum entre deux serveurs
const MARGE = 50;              // distance minimum avec les bords
const NB_VOISINS = 2;          // chaque serveur est relié à ses 2 plus proches voisins
const NB_PAREFEU = 2;
const NB_DATACENTER = 2;

const COULEURS = {
    neutre: "#555555",
    joueur: "#00ff15",
    ia1: "#ff3344",
    ia2: "#ff9933"
};

// ===== 2. État du jeu =====
let noeuds = [];           // les serveurs
let liens = [];            // les câbles : paires d'id [a, b]
let paquets = [];          // les attaques en cours de trajet
let selection = null;      // le serveur sélectionné, ou null si aucun
let etat = "enCours";      // "enCours", "pause", "victoire" ou "defaite"
const minuteursIA = { ia1: DELAI_IA, ia2: DELAI_IA + 1 };
const infoServeurs = document.getElementById("info-serveurs");
const infoEnnemis = document.getElementById("info-ennemis");

// ===== 3. Outils =====
function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function entierAleatoire(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

// Mélange de Fisher-Yates
function melanger(tableau) {
    for (let i = tableau.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tableau[i], tableau[j]] = [tableau[j], tableau[i]];
    }
    return tableau;
}

// ===== 4. Carte aléatoire =====
function placerPoints() {
    // Les 3 points de départ sont fixes pour que la partie soit équitable
    const points = [
        { x: 80,  y: 300 },   // joueur
        { x: 720, y: 90 },    // IA 1
        { x: 720, y: 510 }    // IA 2
    ];

    let essais = 0;
    while (points.length < NB_NOEUDS && essais < 2000) {
        essais++;
        const p = {
            x: MARGE + Math.random() * (canvas.width - 2 * MARGE),
            y: MARGE + Math.random() * (canvas.height - 2 * MARGE)
        };
        // On garde le point seulement s'il est assez loin de tous les autres
        if (points.every(q => distance(p, q) >= DISTANCE_MIN)) {
            points.push(p);
        }
    }
    return points;
}

function relierVoisins(points) {
    const resultat = [];
    const dejaVus = new Set();

    for (let i = 0; i < points.length; i++) {
        // Tous les autres points, du plus proche au plus loin
        const autres = [];
        for (let j = 0; j < points.length; j++) {
            if (j !== i) autres.push(j);
        }
        autres.sort((a, b) => distance(points[i], points[a]) - distance(points[i], points[b]));

        for (const j of autres.slice(0, NB_VOISINS)) {
            const a = Math.min(i, j);
            const b = Math.max(i, j);
            const cle = a + "-" + b;
            if (!dejaVus.has(cle)) {
                dejaVus.add(cle);
                resultat.push([a, b]);
            }
        }
    }
    return resultat;
}

// Parcours en largeur : peut-on aller du serveur 0 à tous les autres ?
function estConnexe(nbPoints, lesLiens) {
    const visites = new Set([0]);
    const file = [0];

    while (file.length > 0) {
        const courant = file.shift();
        for (const [a, b] of lesLiens) {
            let voisin = null;
            if (a === courant) voisin = b;
            if (b === courant) voisin = a;
            if (voisin !== null && !visites.has(voisin)) {
                visites.add(voisin);
                file.push(voisin);
            }
        }
    }
    return visites.size === nbPoints;
}

function genererCarte() {
    let points;
    let nouveauxLiens;

    // On recommence tant que la carte n'est pas valide
    do {
        points = placerPoints();
        nouveauxLiens = relierVoisins(points);
    } while (points.length < NB_NOEUDS || !estConnexe(points.length, nouveauxLiens));

    noeuds = points.map((p, i) => ({
        id: i,
        x: Math.round(p.x),
        y: Math.round(p.y),
        proprio: "neutre",
        puissance: entierAleatoire(5, 15),
        type: "normal"
    }));

    noeuds[0].proprio = "joueur";
    noeuds[1].proprio = "ia1";
    noeuds[2].proprio = "ia2";
    for (let i = 0; i < 3; i++) {
        noeuds[i].puissance = 10;
    }

    // Types spéciaux, placés au hasard sur des serveurs neutres
    const neutres = melanger(noeuds.slice(3));
    for (let i = 0; i < NB_PAREFEU; i++) {
        neutres[i].type = "parefeu";
    }
    for (let i = NB_PAREFEU; i < NB_PAREFEU + NB_DATACENTER; i++) {
        neutres[i].type = "datacenter";
    }

    liens = nouveauxLiens;
}

// ===== 5. Images (pixel art) =====
const TAILLE_IMAGE = 72;

function chargerImage(chemin) {
    const img = new Image();
    img.src = chemin;
    return img;
}

const IMAGES = {
    poste: chargerImage("images/poste.png"),
    datacenter: chargerImage("images/datacenter.png"),
    parefeu: chargerImage("images/parefeu.png")
};

// Quelle image pour ce serveur ? (null = pas d'image)
function imagePour(n) {
    if (n.type === "datacenter") return IMAGES.datacenter;
    if (n.type === "parefeu") return IMAGES.parefeu;
    if (n.proprio === "joueur") return IMAGES.poste;
    return null;
}

// Une image est utilisable si elle est chargée et pas cassée
function imagePrete(img) {
    return img !== null && img.complete && img.naturalWidth > 0;
}

// ===== 6. Dessin =====
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

function dessinerPaquets() {
    for (const p of paquets) {
        // Position entre la source et la cible selon la progression (0 → 1)
        const x = p.source.x + (p.cible.x - p.source.x) * p.progression;
        const y = p.source.y + (p.cible.y - p.source.y) * p.progression;

        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = COULEURS[p.proprio];
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "white";
        ctx.font = "bold 11px Courier New";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.force, x, y - 14);
    }
}

// Serveur avec sprite : l'image remplace le cercle
function dessinerNoeudImage(n, img) {
    const moitie = TAILLE_IMAGE / 2;

    // Le sprite, avec un halo de la couleur du propriétaire
    ctx.save();
    ctx.shadowColor = COULEURS[n.proprio];
    ctx.shadowBlur = 20;
    ctx.drawImage(img, n.x - moitie, n.y - moitie, TAILLE_IMAGE, TAILLE_IMAGE);
    ctx.restore();

    // Cadre : jaune si sélectionné, vert si cible possible
    if (n === selection) {
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 4;
        ctx.strokeRect(n.x - moitie - 4, n.y - moitie - 4, TAILLE_IMAGE + 8, TAILLE_IMAGE + 8);
    } else if (selection !== null && sontRelies(selection, n)) {
        ctx.strokeStyle = "#33ff99";
        ctx.lineWidth = 2;
        ctx.strokeRect(n.x - moitie - 4, n.y - moitie - 4, TAILLE_IMAGE + 8, TAILLE_IMAGE + 8);
    }

    // Badge de puissance, de la couleur du propriétaire
    const yBadge = n.y + moitie + 10;
    ctx.fillStyle = COULEURS[n.proprio];
    ctx.fillRect(n.x - 16, yBadge - 9, 32, 18);

    ctx.font = "bold 13px Courier New";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "black";             // contour noir : lisible sur toutes les couleurs
    ctx.lineWidth = 3;
    ctx.strokeText(Math.floor(n.puissance), n.x, yBadge);
    ctx.fillStyle = "white";
    ctx.fillText(Math.floor(n.puissance), n.x, yBadge);
}

// Serveur sans sprite : le cercle classique
function dessinerNoeudCercle(n) {
    // Anneau supplémentaire pour les pare-feu
    if (n.type === "parefeu") {
        ctx.beginPath();
        ctx.arc(n.x, n.y, RAYON + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "#33ff99";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Le cercle
    ctx.beginPath();
    ctx.arc(n.x, n.y, RAYON, 0, Math.PI * 2);
    ctx.fillStyle = COULEURS[n.proprio];
    ctx.fill();

    // Le contour : sélection, cible possible ou normal
    if (n === selection) {
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 5;
    } else if (selection !== null && sontRelies(selection, n)) {
        ctx.strokeStyle = "#33ff99";
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

    // Étiquette du type (en attendant les sprites DC / FW)
    if (n.type !== "normal") {
        ctx.fillStyle = "#33ff99";
        ctx.font = "bold 11px Courier New";
        const etiquette = n.type === "parefeu" ? "FW" : "DC";
        ctx.fillText(etiquette, n.x, n.y + RAYON + 14);
    }
}

function dessinerNoeuds() {
    ctx.imageSmoothingEnabled = false;   // garde le pixel art net

    for (const n of noeuds) {
        const img = imagePour(n);
        if (imagePrete(img)) {
            dessinerNoeudImage(n, img);
        } else {
            dessinerNoeudCercle(n);
        }
    }
}

function dessinerFin() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = "bold 48px Courier New";
    if (etat === "victoire") {
        ctx.fillStyle = "#33ff99";
        ctx.fillText("RÉSEAU CONQUIS", canvas.width / 2, canvas.height / 2 - 30);
    } else {
        ctx.fillStyle = "#ff3344";
        ctx.fillText("CONNEXION PERDUE", canvas.width / 2, canvas.height / 2 - 30);
    }

    ctx.fillStyle = "white";
    ctx.font = "20px Courier New";
    ctx.fillText("Clique pour une nouvelle carte", canvas.width / 2, canvas.height / 2 + 30);
}

function dessinerPause() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#33ff99";
    ctx.font = "bold 48px Courier New";
    ctx.fillText("PAUSE", canvas.width / 2, canvas.height / 2 - 30);

    ctx.fillStyle = "white";
    ctx.font = "20px Courier New";
    ctx.fillText("P, Échap ou clic pour reprendre", canvas.width / 2, canvas.height / 2 + 30);
}

function dessiner() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dessinerLiens();
    dessinerPaquets();
    dessinerNoeuds();

    if (etat === "pause") {
        dessinerPause();
    } else if (etat === "victoire" || etat === "defaite") {
        dessinerFin();
    }
}

// ===== 7. Attaque =====
function sontRelies(a, b) {
    for (const [x, y] of liens) {
        if ((x === a.id && y === b.id) || (x === b.id && y === a.id)) {
            return true;
        }
    }
    return false;
}

// Envoie un paquet de la source vers la cible
function attaquer(source, cible) {
    if (!sontRelies(source, cible)) return;

    const force = Math.floor(source.puissance / 2);
    if (force < 1) return;           // pas assez de puissance pour attaquer

    source.puissance -= force;

    paquets.push({
        source: source,
        cible: cible,
        proprio: source.proprio,
        force: force,
        progression: 0               // 0 = au départ, 1 = arrivé
    });
}

// Ce qui se passe quand un paquet arrive à destination
function arriveePaquet(p) {
    const cible = p.cible;

    if (cible.proprio === p.proprio) {
        // Renfort entre deux serveurs alliés
        cible.puissance = Math.min(cible.puissance + p.force, PUISSANCE_MAX);
        return;
    }

    // Un pare-feu divise la force de l'attaque par 2
    let force = p.force;
    if (cible.type === "parefeu") {
        force = force / 2;
    }

    if (force > cible.puissance) {
        // Victoire : on pirate le serveur
        cible.proprio = p.proprio;
        cible.puissance = force - cible.puissance;
    } else {
        // Échec : on affaiblit la cible
        cible.puissance -= force;
    }
}

function mettreAJourPaquets(dt) {
    for (const p of paquets) {
        // On avance d'une fraction du trajet, selon la longueur du câble
        p.progression += (VITESSE_PAQUET * dt) / distance(p.source, p.cible);
        if (p.progression >= 1) {
            arriveePaquet(p);
        }
    }
    // On retire les paquets arrivés
    paquets = paquets.filter(p => p.progression < 1);
}

// ===== 8. IA ennemie =====
function jouerIA(ia) {
    let meilleur = null;   // la meilleure attaque trouvée

    for (const source of noeuds) {
        if (source.proprio !== ia) continue;   // seulement ses serveurs

        const force = Math.floor(source.puissance / 2);

        for (const cible of noeuds) {
            if (cible.proprio === ia) continue;           // pas ses propres serveurs
            if (!sontRelies(source, cible)) continue;     // seulement les voisins

            // Un pare-feu compte double en défense
            const defense = cible.type === "parefeu" ? cible.puissance * 2 : cible.puissance;
            if (force <= defense) continue;               // seulement les attaques gagnantes

            if (meilleur === null || defense < meilleur.defense) {
                meilleur = { source: source, cible: cible, defense: defense };
            }
        }
    }

    if (meilleur !== null) {
        attaquer(meilleur.source, meilleur.cible);
    }
}

// ===== 9. Fin de partie =====
function compter(proprio) {
    return noeuds.filter(n => n.proprio === proprio).length;
}

function verifierFin() {
    const mesServeurs = compter("joueur");
    const serveursEnnemis = compter("ia1") + compter("ia2");
    const mesPaquets = paquets.filter(p => p.proprio === "joueur").length;

    if (mesServeurs === 0 && mesPaquets === 0) {
        etat = "defaite";
    } else if (serveursEnnemis === 0) {
        etat = "victoire";
    }
}

function mettreAJourInfos() {
    let ennemisRestants = 0;
    if (compter("ia1") > 0) ennemisRestants++;
    if (compter("ia2") > 0) ennemisRestants++;

    infoServeurs.textContent = `${compter("joueur")} / ${noeuds.length}`;
    infoEnnemis.textContent = ennemisRestants;
}

function nouvellePartie() {
    genererCarte();
    paquets = [];
    selection = null;
    etat = "enCours";
    minuteursIA.ia1 = DELAI_IA;
    minuteursIA.ia2 = DELAI_IA + 1;
    boutonPause.textContent = "⏸ Pause";
}

// ===== 10. Mise à jour (appelée à chaque image) =====
function mettreAJour(dt) {
    if (etat !== "enCours") return;   // le jeu est figé en pause ou à la fin

    // Croissance des serveurs (les neutres ne grandissent pas)
    for (const n of noeuds) {
        if (n.proprio !== "neutre") {
            const bonus = n.type === "datacenter" ? 2 : 1;
            n.puissance += CROISSANCE * bonus * dt;
            n.puissance = Math.min(n.puissance, PUISSANCE_MAX);
        }
    }

    mettreAJourPaquets(dt);

    // Chaque IA décide quand son minuteur arrive à 0
    for (const ia of ["ia1", "ia2"]) {
        minuteursIA[ia] -= dt;
        if (minuteursIA[ia] <= 0) {
            jouerIA(ia);
            minuteursIA[ia] = DELAI_IA + Math.random();   // un peu d'imprévu
        }
    }

    // Si mon serveur sélectionné a été piraté, je perds la sélection
    if (selection !== null && selection.proprio !== "joueur") {
        selection = null;
    }

    verifierFin();
    mettreAJourInfos();
}

// ===== 11. Clic de la souris =====
function noeudSousLaSouris(x, y) {
    for (const n of noeuds) {
        if (distance({ x: x, y: y }, n) <= RAYON) {
            return n;
        }
    }
    return null;
}

canvas.addEventListener("click", (event) => {
    // En pause : un clic reprend la partie
    if (etat === "pause") {
        basculerPause();
        return;
    }

    // Partie finie : un clic lance une nouvelle carte
    if (etat === "victoire" || etat === "defaite") {
        nouvellePartie();
        return;
    }

    // Convertir la position de la souris en coordonnées du canvas
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);

    const n = noeudSousLaSouris(x, y);

    if (n === null) {
        selection = null;                // clic dans le vide
    } else if (selection !== null && n !== selection && sontRelies(selection, n)) {
        attaquer(selection, n);          // attaque ou renfort
        selection = null;
    } else if (n.proprio === "joueur") {
        selection = n;                   // sélection d'un de mes serveurs
    }
});

// ===== 12. Choix des couleurs =====
const avertissement = document.getElementById("avertissement");

const NOMS = {
    neutre: "les serveurs neutres",
    joueur: "toi",
    ia1: "l'IA 1",
    ia2: "l'IA 2"
};

// "#ff3344" → { r: 255, g: 51, b: 68 }
function hexVersRgb(hex) {
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
    };
}

// Deux couleurs sont "trop proches" si leur distance RGB est petite
function tropProches(couleur1, couleur2) {
    const a = hexVersRgb(couleur1);
    const b = hexVersRgb(couleur2);
    const d = Math.sqrt(
        (a.r - b.r) ** 2 +
        (a.g - b.g) ** 2 +
        (a.b - b.b) ** 2
    );
    return d < 80;
}

for (const proprio of ["joueur", "ia1", "ia2"]) {
    const input = document.getElementById("couleur-" + proprio);

    input.addEventListener("input", () => {
        const nouvelle = input.value;

        // Comparer avec toutes les autres couleurs
        for (const autre in COULEURS) {
            if (autre === proprio) continue;

            if (tropProches(nouvelle, COULEURS[autre])) {
                avertissement.textContent = `⚠ Couleur trop proche de celle de ${NOMS[autre]} !`;
                input.value = COULEURS[proprio];   // on remet l'ancienne couleur
                return;
            }
        }

        // Couleur valide : on l'applique
        COULEURS[proprio] = nouvelle;
        avertissement.textContent = "";
    });
}

// ===== 13. Pause =====
const boutonPause = document.getElementById("bouton-pause");

function basculerPause() {
    if (etat === "enCours") {
        etat = "pause";
        selection = null;
        boutonPause.textContent = "▶ Reprendre";
    } else if (etat === "pause") {
        etat = "enCours";
        boutonPause.textContent = "⏸ Pause";
    }
    // En victoire ou défaite, le bouton ne fait rien
}

boutonPause.addEventListener("click", basculerPause);

document.addEventListener("keydown", (event) => {
    if (event.key === "p" || event.key === "P" || event.key === "Escape") {
        basculerPause();
    }
});

// Pause automatique quand on change d'onglet
document.addEventListener("visibilitychange", () => {
    if (document.hidden && etat === "enCours") {
        basculerPause();
    }
});

// ===== 14. Boucle de jeu =====
let dernierTemps = performance.now();

function boucle(maintenant) {
    // Temps écoulé depuis la dernière image, en secondes
    const dt = (maintenant - dernierTemps) / 1000;
    dernierTemps = maintenant;

    mettreAJour(dt);
    dessiner();

    requestAnimationFrame(boucle);
}

nouvellePartie();              // première carte
requestAnimationFrame(boucle);