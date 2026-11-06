/*
   Réglages du jeu
   Les constantes sont regroupées ici */

const canvas = document.getElementById("jeu");   // la zone de dessin
const ctx = canvas.getContext("2d");             // le "pinceau" pour dessiner dedans

const RAYON = 36;            // rayon d'un serveur dessiné en cercle, sert aussi pour le clic
const CROISSANCE = 1;        // puissance gagnée par seconde par un serveur
const PUISSANCE_MAX = 99;    // un serveur ne peut pas dépasser cette valeur
const DELAI_IA = 2;          // temps en secondes entre deux coups d'une IA
const VITESSE_PAQUET = 150;  // vitesse des attaques en pixels par seconde

const NB_NOEUDS = 14;        // nombre de serveurs sur la carte
const DISTANCE_MIN = 130;    // écart minimum entre deux serveurs
const MARGE = 50;            // écart minimum entre un serveur et le bord
const NB_VOISINS = 2;        // chaque serveur est relié à ses 2 voisins les plus proches
const NB_PAREFEU = 2;        // nombre de pare-feu (défense x2)
const NB_DATACENTER = 2;     // nombre de datacenters (production x2)

// une couleur par joueur
const COULEURS = {
    neutre: "#555555",
    joueur: "#00ff15",
    ia1: "#ff3344",
    ia2: "#ff9933"
};


/*
   État du jeu
   ces variables changent pendant le jeu 
*/

let noeuds = [];         // les serveurs : { id, x, y, proprio, puissance, type }
let liens = [];          // les câbles : paires d'id [a, b]
let paquets = [];        // les attaques en train de voyager sur les câbles
let selection = null;    // le serveur sélectionné par le joueur, null si aucun
let etat = "enCours";    // "enCours", "pause", "victoire" ou "defaite"

const minuteursIA = { ia1: DELAI_IA, ia2: DELAI_IA + 1 };   // compte à rebours de chaque IA

// éléments du panneau au-dessus du jeu
const infoServeurs = document.getElementById("info-serveurs");
const infoEnnemis = document.getElementById("info-ennemis");


/*
   Fonctions
*/

// Calcule la distance entre deux points a et b (théorème de Pythagore).
// Sert a savoir ou nous avons cliqué
function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Renvoie un nombre entier au hasard entre min et max (inclus).
function entierAleatoire(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

// Mélange un tableau au hasard, utilse pour gerer des chemins aleatoires
function melanger(tableau) {
    for (let i = tableau.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tableau[i], tableau[j]] = [tableau[j], tableau[i]];   // échange des deux cases
    }
    return tableau;
}


/*
   Génération de la carte
   À chaque partie on crée un nouveau réseau au hasard :
   1. on place les serveurs, 2. on les relie, 3. on vérifie
   qu'on peut tous les atteindre. Sinon on recommence.
*/

// Place NB_NOEUDS points au hasard, assez éloignés les uns des autres.
// Les 3 premiers sont fixes (joueur, ia1, ia2) pour que la partie soit équitable.
// Renvoie un tableau de points { x, y }.
function placerPoints() {
    const points = [
        { x: 80, y: 300 },    // départ du joueur, à gauche
        { x: 720, y: 90 },    // départ de l'IA 1, en haut à droite
        { x: 720, y: 510 }    // départ de l'IA 2, en bas à droite
    ];

    let essais = 0;   // limite pour ne jamais boucler à l'infini
    while (points.length < NB_NOEUDS && essais < 2000) {
        essais++;
        const p = {
            x: MARGE + Math.random() * (canvas.width - 2 * MARGE),
            y: MARGE + Math.random() * (canvas.height - 2 * MARGE)
        };
        // on garde le point seulement s'il est assez loin de tous les autres
        if (points.every(q => distance(p, q) >= DISTANCE_MIN)) {
            points.push(p);
        }
    }
    return points;
}

// Relie chaque point à ses NB_VOISINS voisins les plus proches.
// Renvoie la liste des câbles sous forme de paires [a, b], sans doublon.
function relierVoisins(points) {
    const resultat = [];
    const dejaVus = new Set();   // mémorise les câbles déjà créés, ex: "2-5"

    for (let i = 0; i < points.length; i++) {
        // liste des autres points, triés du plus proche au plus loin
        const autres = [];
        for (let j = 0; j < points.length; j++) {
            if (j !== i) autres.push(j);
        }
        autres.sort((a, b) => distance(points[i], points[a]) - distance(points[i], points[b]));

        // on relie aux plus proches
        for (const j of autres.slice(0, NB_VOISINS)) {
            const a = Math.min(i, j);
            const b = Math.max(i, j);
            const cle = a + "-" + b;
            if (!dejaVus.has(cle)) {   // évite de créer deux fois le même câble
                dejaVus.add(cle);
                resultat.push([a, b]);
            }
        }
    }
    return resultat;
}

// Vérifie que tous les serveurs sont reliés entre eux (parcours en largeur).
// On part du serveur 0 et on visite les voisins de proche en proche.
// Renvoie true si on a pu atteindre tous les serveurs.
function estConnexe(nbPoints, lesLiens) {
    const visites = new Set([0]);   // serveurs déjà atteints
    const file = [0];               // serveurs dont il faut encore regarder les voisins

    while (file.length > 0) {
        const courant = file.shift();   // on prend le premier de la file
        for (const [a, b] of lesLiens) {
            // si le câble touche le serveur courant, on regarde l'autre bout
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

// Crée une carte complète et la met dans noeuds et liens.
// Recommence tant que la carte n'a pas assez de serveurs ou n'est pas connexe.
function genererCarte() {
    let points;
    let nouveauxLiens;

    // do...while : on génère au moins une fois, puis on recommence si besoin
    do {
        points = placerPoints();
        nouveauxLiens = relierVoisins(points);
    } while (points.length < NB_NOEUDS || !estConnexe(points.length, nouveauxLiens));

    // chaque point devient un serveur neutre avec une puissance au hasard
    noeuds = points.map((p, i) => ({
        id: i,                         // l'id est aussi sa position dans le tableau
        x: Math.round(p.x),
        y: Math.round(p.y),
        proprio: "neutre",
        puissance: entierAleatoire(5, 15),
        type: "normal"
    }));

    // les 3 premiers serveurs sont les points de départ
    noeuds[0].proprio = "joueur";
    noeuds[1].proprio = "ia1";
    noeuds[2].proprio = "ia2";
    for (let i = 0; i < 3; i++) {
        noeuds[i].puissance = 10;
    }

    // on mélange les serveurs neutres et on choisit les pare-feu et datacenters
    const neutres = melanger(noeuds.slice(3));
    for (let i = 0; i < NB_PAREFEU; i++) {
        neutres[i].type = "parefeu";
    }
    for (let i = NB_PAREFEU; i < NB_PAREFEU + NB_DATACENTER; i++) {
        neutres[i].type = "datacenter";
    }

    liens = nouveauxLiens;
}


/*
   Images
*/

const TAILLE_IMAGE = 72;   // taille d'affichage des sprites en pixels

// affiche une image par default si trouve pas d'image dans le chemin donnée
function chargerImage(chemin) {
    const img = new Image();
    img.src = chemin;
    return img;
}

// les clés ont le même nom que les propriétaires ou les types
const IMAGES = {
    joueur: chargerImage("images/poste.png"),
    datacenter: chargerImage("images/datacenter.png"),
    parefeu: chargerImage("images/parefeu.png")
};

// Choisit l'image à afficher pour un serveur.
function imagePour(n) {
    if (n.type === "datacenter") return IMAGES.datacenter;
    if (n.type === "parefeu") return IMAGES.parefeu;
    if (n.proprio === "neutre") return null;

    const sprite = IMAGES[n.proprio];
    if (imagePrete(sprite)) return sprite;
    return IMAGES.joueur;   // image de repli
}

// Renvoie true si l'image existe et a fini de charger correctement.
function imagePrete(img) {
    return img !== undefined && img !== null && img.complete && img.naturalWidth > 0;
}


/*
   Dessin
*/

// Dessine une ligne pour chaque câble.
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

// Dessine les attaques en route : un petit cercle avec sa force au-dessus.
function dessinerPaquets() {
    for (const p of paquets) {
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


// l'image avec un halo de la couleur du propriétaire et cadre si sélectionné
function dessinerNoeudImage(n, img) {
    const moitie = TAILLE_IMAGE / 2;

    // cercle autour du pc du joueur
    ctx.save();
    ctx.shadowColor = COULEURS[n.proprio];
    ctx.shadowBlur = 20;
    ctx.drawImage(img, n.x - moitie, n.y - moitie, TAILLE_IMAGE, TAILLE_IMAGE);
    ctx.restore();

    // cadre jaune si sélectionné, vert si c'est une cible possible
    if (n === selection) {
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 4;
        ctx.strokeRect(n.x - moitie - 4, n.y - moitie - 4, TAILLE_IMAGE + 8, TAILLE_IMAGE + 8);
    } else if (selection !== null && sontRelies(selection, n)) {
        ctx.strokeStyle = "#33ff99";
        ctx.lineWidth = 2;
        ctx.strokeRect(n.x - moitie - 4, n.y - moitie - 4, TAILLE_IMAGE + 8, TAILLE_IMAGE + 8);
    }

    // badge de la couleur du propriétaire
    const yBadge = n.y + moitie + 10;
    ctx.fillStyle = COULEURS[n.proprio];
    ctx.fillRect(n.x - 16, yBadge - 9, 32, 18);

    // puissance : contour noir puis texte blanc, lisible sur toutes les couleurs
    ctx.font = "bold 13px Courier New";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.strokeText(Math.floor(n.puissance), n.x, yBadge);
    ctx.fillStyle = "white";
    ctx.fillText(Math.floor(n.puissance), n.x, yBadge);

    // rappel du bonus de défense pour les pare-feu
    if (n.type === "parefeu") {
        ctx.fillStyle = "#33ff99";
        ctx.font = "bold 11px Courier New";
        ctx.fillText("DEF x2", n.x, n.y - moitie - 8);
    }
}

// Dessine un serveur sans image : un cercle de la couleur du propriétaire
// avec la puissance au milieu, et FW ou DC en dessous pour les serveurs spéciaux.
function dessinerNoeudCercle(n) {
    // anneau en plus autour des pare-feu
    if (n.type === "parefeu") {
        ctx.beginPath();
        ctx.arc(n.x, n.y, RAYON + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "#33ff99";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // le cercle
    ctx.beginPath();
    ctx.arc(n.x, n.y, RAYON, 0, Math.PI * 2);
    ctx.fillStyle = COULEURS[n.proprio];
    ctx.fill();

    // contour : jaune si sélectionné, vert si cible possible, blanc sinon
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

    // la puissance arrondie (elle a des décimales car elle grandit en continu)
    ctx.fillStyle = "white";
    ctx.font = "bold 16px Courier New";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(Math.floor(n.puissance), n.x, n.y);

    if (n.type !== "normal") {
        ctx.fillStyle = "#33ff99";
        ctx.font = "bold 11px Courier New";
        const etiquette = n.type === "parefeu" ? "FW" : "DC";
        ctx.fillText(etiquette, n.x, n.y + RAYON + 14);
    }
}

// Dessine tous les serveurs : en image si elle est prête, sinon en cercle.
function dessinerNoeuds() {
    ctx.imageSmoothingEnabled = false;   // sans ça le pixel art devient flou

    for (const n of noeuds) {
        const img = imagePour(n);
        if (imagePrete(img)) {
            dessinerNoeudImage(n, img);
        } else {
            dessinerNoeudCercle(n);
        }
    }
}

// Écran de fin : voile sombre et message de victoire ou de défaite.
function dessinerFin() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = "bold 48px Courier New";
    if (etat === "victoire") {
        ctx.fillStyle = "#33ff99";
        ctx.fillText("RESEAU CONQUIS", canvas.width / 2, canvas.height / 2 - 30);
    } else {
        ctx.fillStyle = "#ff3344";
        ctx.fillText("CONNEXION PERDUE", canvas.width / 2, canvas.height / 2 - 30);
    }

    ctx.fillStyle = "white";
    ctx.font = "20px Courier New";
    ctx.fillText("Clique pour une nouvelle carte", canvas.width / 2, canvas.height / 2 + 30);
}

// Écran de pause : voile sombre et message.
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
    ctx.fillText("P, Echap ou clic pour reprendre", canvas.width / 2, canvas.height / 2 + 30);
}

// Affiche au-dessus du serveur sélectionné la quantité qui partira au prochain clic.
// Même calcul que dans attaquer(), pour que le joueur voie le résultat avant d'agir.
function dessinerApercuEnvoi() {
    if (selection === null) return;

    const quantite = Math.floor(selection.puissance * fractionEnvoi);
    ctx.fillStyle = "#ffff00";
    ctx.font = "bold 14px Courier New";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("envoi " + quantite, selection.x, selection.y - TAILLE_IMAGE / 2 - 22);
}

// Redessine tout l'écran. Appelée à chaque image par la boucle de jeu.
function dessiner() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);   // on efface tout
    dessinerLiens();
    dessinerPaquets();
    dessinerNoeuds();
    dessinerApercuEnvoi();

    if (etat === "pause") {
        dessinerPause();
    } else if (etat === "victoire" || etat === "defaite") {
        dessinerFin();
    }
}


/*
   Attaques
   Une attaque envoie un paquet le long d'un câble.
   Le combat n'a lieu qu'à l'arrivée du paquet.
   Le joueur et les IA utilisent les mêmes fonctions, donc les mêmes règles.
*/

// Renvoie true si un câble relie les serveurs a et b.
// Un câble marche dans les deux sens (graphe non orienté).
function sontRelies(a, b) {
    for (const [x, y] of liens) {
        if ((x === a.id && y === b.id) || (x === b.id && y === a.id)) {
            return true;
        }
    }
    return false;
}

// Lance une attaque de source vers cible.
// fraction = part de la puissance envoyée (de 0.01 à 1).
// Elle vaut 0.5 par défaut : l'IA ne la précise pas et envoie donc 50 %.
function attaquer(source, cible, fraction = 0.5) {
    if (!sontRelies(source, cible)) return;   // pas de câble : impossible

    const force = Math.floor(source.puissance * fraction);
    if (force < 1) return;                    // rien à envoyer

    source.puissance -= force;

    // le paquet part avec une progression de 0
    paquets.push({
        source: source,
        cible: cible,
        proprio: source.proprio,
        force: force,
        progression: 0
    });
}

// Renvoie la défense d'un serveur : la puissance affichée (arrondie),
// doublée si c'est un pare-feu. Utilisée par le combat et par l'IA.
function defenseDe(n) {
    const base = Math.floor(n.puissance);
    return n.type === "parefeu" ? base * 2 : base;
}

// Résout le combat quand un paquet arrive sur sa cible.
function arriveePaquet(p) {
    const cible = p.cible;

    // cible alliée : c'est un renfort, on ajoute la force
    if (cible.proprio === p.proprio) {
        cible.puissance = Math.min(cible.puissance + p.force, PUISSANCE_MAX);
        return;
    }

    const defense = defenseDe(cible);

    if (p.force > defense) {
        // attaque gagnée : le serveur change de camp et garde ce qui reste
        cible.proprio = p.proprio;
        cible.puissance = p.force - defense;
    } else {
        // attaque perdue : la cible perd des points, un pare-feu n'en perd que la moitié
        const degats = cible.type === "parefeu" ? Math.floor(p.force / 2) : p.force;
        cible.puissance = Math.floor(cible.puissance) - degats;
    }
}

// Fait avancer tous les paquets et retire ceux qui sont arrivés.
// dt = temps écoulé depuis la dernière image, en secondes.
function mettreAJourPaquets(dt) {
    for (const p of paquets) {
        // on divise par la longueur du câble pour que tous les paquets
        // aillent à la même vitesse, quelle que soit la distance
        p.progression += (VITESSE_PAQUET * dt) / distance(p.source, p.cible);
        if (p.progression >= 1) {
            arriveePaquet(p);
        }
    }
    paquets = paquets.filter(p => p.progression < 1);   // on garde ceux encore en route
}


/*
   IA ennemie
   IA "gloutonne" : à chaque tour elle prend le meilleur choix
   immédiat, sans planifier sur plusieurs coups.
*/

// Estime la défense de la cible au moment où le paquet arrivera.
// Pendant le trajet la cible continue de grandir, il faut en tenir compte.
// temps de trajet = distance / vitesse, croissance = vitesse de croissance x temps.
function defenseALArrivee(source, cible) {
    let defense = defenseDe(cible);

    if (cible.proprio !== "neutre") {   // les neutres ne grandissent pas
        const trajet = distance(source, cible) / VITESSE_PAQUET;
        const bonus = cible.type === "datacenter" ? 2 : 1;
        let croissance = CROISSANCE * bonus * trajet;
        if (cible.type === "parefeu") croissance *= 2;
        defense += Math.ceil(croissance);   // arrondi vers le haut par prudence
    }
    return defense;
}

// Fait jouer une IA ("ia1" ou "ia2").
// Elle teste toutes les paires (un de ses serveurs, un serveur voisin),
// garde seulement les attaques sûres de gagner, et choisit la cible la plus faible.
function jouerIA(ia) {
    let meilleur = null;   // meilleure attaque trouvée pour l'instant

    for (const source of noeuds) {
        if (source.proprio !== ia) continue;   // seulement ses propres serveurs

        const force = Math.floor(source.puissance / 2);

        for (const cible of noeuds) {
            if (cible.proprio === ia) continue;           // pas ses propres serveurs
            if (!sontRelies(source, cible)) continue;     // seulement les voisins

            const defense = defenseALArrivee(source, cible);
            if (force <= defense) continue;               // attaque perdante : on ignore

            // recherche du minimum : on garde la cible la plus faible
            if (meilleur === null || defense < meilleur.defense) {
                meilleur = { source: source, cible: cible, defense: defense };
            }
        }
    }

    if (meilleur !== null) {
        attaquer(meilleur.source, meilleur.cible);   // sans fraction : 50 %
    }
}


/*
   Fin de partie
   Comptage des serveurs, conditions de victoire et de défaite,
   panneau d'informations et nouvelle partie.
*/

// Renvoie le nombre de serveurs qui appartiennent à ce propriétaire.
function compter(proprio) {
    return noeuds.filter(n => n.proprio === proprio).length;
}

// Change l'état si la partie est finie :
// défaite si le joueur n'a plus de serveur ni de paquet en route,
// victoire s'il ne reste plus aucun serveur ennemi.
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

// Met à jour le panneau au-dessus du jeu (serveurs possédés, ennemis restants).
function mettreAJourInfos() {
    let ennemisRestants = 0;
    if (compter("ia1") > 0) ennemisRestants++;
    if (compter("ia2") > 0) ennemisRestants++;

    infoServeurs.textContent = `${compter("joueur")} / ${noeuds.length}`;
    infoEnnemis.textContent = ennemisRestants;
}

// Remet tout à zéro avec une nouvelle carte.
function nouvellePartie() {
    genererCarte();
    paquets = [];
    selection = null;
    etat = "enCours";
    minuteursIA.ia1 = DELAI_IA;
    minuteursIA.ia2 = DELAI_IA + 1;
    boutonPause.textContent = "Pause";
}


/*
   Mise à jour
   Appelée à chaque image : fait évoluer toutes les données du jeu.
*/

// dt = temps écoulé depuis l'image précédente, en secondes.
// Multiplier par dt permet d'avoir la même vitesse sur tous les écrans (60 Hz ou 144 Hz).
function mettreAJour(dt) {
    if (etat !== "enCours") return;   // en pause ou partie finie : rien ne bouge

    // 1. croissance des serveurs possédés (deux fois plus vite pour un datacenter)
    for (const n of noeuds) {
        if (n.proprio !== "neutre") {
            const bonus = n.type === "datacenter" ? 2 : 1;
            n.puissance += CROISSANCE * bonus * dt;
            n.puissance = Math.min(n.puissance, PUISSANCE_MAX);
        }
    }

    // 2. déplacement des paquets et combats
    mettreAJourPaquets(dt);

    // 3. chaque IA joue quand son compte à rebours arrive à 0
    for (const ia of ["ia1", "ia2"]) {
        minuteursIA[ia] -= dt;
        if (minuteursIA[ia] <= 0) {
            jouerIA(ia);
            minuteursIA[ia] = DELAI_IA + Math.random();   // un peu de hasard dans le rythme
        }
    }

    // 4. si mon serveur sélectionné s'est fait pirater, je perds la sélection
    if (selection !== null && selection.proprio !== "joueur") {
        selection = null;
    }

    // 5. fin de partie et panneau d'infos
    verifierFin();
    mettreAJourInfos();
}


/*
   Clic de la souris
   Sélection d'un serveur, puis attaque ou renfort sur un voisin.
*/

// Renvoie le serveur qui se trouve sous le point (x, y), ou null.
// Sur téléphone le canvas est réduit, donc on agrandit la zone de clic
// pour qu'elle fasse au moins 44 pixels réels (taille d'un doigt).
function noeudSousLaSouris(x, y) {
    const echelle = canvas.getBoundingClientRect().width / canvas.width;
    const tolerance = Math.max(RAYON, 22 / echelle);

    for (const n of noeuds) {
        if (distance({ x: x, y: y }, n) <= tolerance) {
            return n;
        }
    }
    return null;
}

// Que se passe-t-il quand on clique dans le jeu
canvas.addEventListener("click", (event) => {
    // en pause : le clic reprend la partie
    if (etat === "pause") {
        basculerPause();
        return;
    }

    // partie finie : le clic lance une nouvelle carte
    if (etat === "victoire" || etat === "defaite") {
        nouvellePartie();
        return;
    }

    // conversion de la position de la souris en coordonnées du canvas
    // (le canvas peut être affiché plus petit par le CSS)
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);

    const n = noeudSousLaSouris(x, y);

    if (n === null) {
        selection = null;                                  // clic dans le vide
    } else if (selection !== null && n !== selection && sontRelies(selection, n)) {
        attaquer(selection, n, fractionEnvoi);             // attaque ou renfort
        selection = null;
    } else if (n.proprio === "joueur") {
        selection = n;                                     // on sélectionne un de ses serveurs
    }
});


/*
   Choix des couleurs
   Le joueur peut changer les couleurs, mais deux couleurs
   trop proches sont refusées pour rester lisible.
*/

const avertissement = document.getElementById("avertissement");

// noms affichés dans le message d'avertissement
const NOMS = {
    neutre: "les serveurs neutres",
    joueur: "toi",
    ia1: "l'IA 1",
    ia2: "l'IA 2"
};

// Convertit une couleur "#ff3344" en { r: 255, g: 51, b: 68 }.
// Chaque paire de caractères est un nombre en hexadécimal (base 16).
function hexVersRgb(hex) {
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
    };
}

// Renvoie true si deux couleurs se ressemblent trop.
// On calcule la distance entre elles comme entre deux points en 3D (r, g, b).
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

// Pour chaque sélecteur de couleur : à chaque changement, on compare
// la nouvelle couleur à toutes les autres. Si elle est trop proche,
// on affiche un message et on remet l'ancienne couleur.
for (const proprio of ["joueur", "ia1", "ia2"]) {
    const input = document.getElementById("couleur-" + proprio);

    input.addEventListener("input", () => {
        const nouvelle = input.value;

        for (const autre in COULEURS) {
            if (autre === proprio) continue;

            if (tropProches(nouvelle, COULEURS[autre])) {
                avertissement.textContent = "Couleur trop proche de celle de " + NOMS[autre];
                input.value = COULEURS[proprio];
                return;
            }
        }

        // couleur acceptée : le dessin l'utilisera dès l'image suivante
        COULEURS[proprio] = nouvelle;
        avertissement.textContent = "";
    });
}


/*
   Pause
   La pause est juste un état de plus : mettreAJour() ne fait
   plus rien, mais l'écran continue d'être dessiné.
*/

const boutonPause = document.getElementById("bouton-pause");

// Passe de "enCours" à "pause" et inversement.
// Ne fait rien si la partie est finie.
function basculerPause() {
    if (etat === "enCours") {
        etat = "pause";
        selection = null;
        boutonPause.textContent = "Reprendre";
    } else if (etat === "pause") {
        etat = "enCours";
        boutonPause.textContent = "Pause";
    }
}

boutonPause.addEventListener("click", basculerPause);

// Raccourcis clavier : P ou Echap pour la pause,
// 1 à 5 pour envoyer 20 %, 40 %, 60 %, 80 % ou 100 %.
document.addEventListener("keydown", (event) => {
    if (event.key === "p" || event.key === "P" || event.key === "Escape") {
        basculerPause();
    }
    if (event.key >= "1" && event.key <= "5") {
        changerEnvoi(Number(event.key) * 20);
    }
});

// Pause automatique quand on change d'onglet.
// Sinon, au retour, dt vaudrait plusieurs secondes d'un coup.
document.addEventListener("visibilitychange", () => {
    if (document.hidden && etat === "enCours") {
        basculerPause();
    }
});


/*
   Quantité envoyée
   Le joueur choisit la part de puissance envoyée à chaque attaque
   avec le curseur (1 à 100 %) ou les touches 1 à 5.
*/

const curseurEnvoi = document.getElementById("envoi");
const texteEnvoi = document.getElementById("valeur-envoi");
let fractionEnvoi = 0.5;   // 50 % au départ

// Change la quantité envoyée et garde trois choses synchronisées :
// la variable, la position du curseur et le texte affiché.
function changerEnvoi(pourcentage) {
    fractionEnvoi = pourcentage / 100;
    curseurEnvoi.value = pourcentage;
    texteEnvoi.textContent = pourcentage + " %";
}

curseurEnvoi.addEventListener("input", () => {
    changerEnvoi(Number(curseurEnvoi.value));
});


/*
   Boucle de jeu
   Le navigateur appelle boucle() environ 60 fois par seconde.
   À chaque fois : on calcule le temps écoulé, on met à jour, on dessine.
*/

let dernierTemps = performance.now();   // heure de l'image précédente

function boucle(maintenant) {
    const dt = (maintenant - dernierTemps) / 1000;   // temps écoulé en secondes
    dernierTemps = maintenant;

    mettreAJour(dt);
    dessiner();

    requestAnimationFrame(boucle);   // on demande l'image suivante
}

// lancement du jeu : première carte puis démarrage de la boucle
nouvellePartie();
requestAnimationFrame(boucle);