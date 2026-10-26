/**
 * Bot Discord - Leaderboard Shibuya
 * Suivi et classement quotidien des actions de gestion/modération (Unjails & Grabs)
 */

require('dotenv').config();
const http = require('http');
const { Client } = require('discord.js-selfbot-v13');

// Mini serveur HTTP pour l'offre gratuite Web Service de Render.com
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Shibuya Stats - En ligne 24/7\n');
}).listen(PORT, () => console.log(`🌐 Serveur Web de santé démarré sur le port ${PORT}`));

// Configuration du Bot et des Identifiants
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    CHANNEL_ID: process.env.CHANNEL_ID,
    GUILD_ID: process.env.GUILD_ID, // Serveur où se trouve le salon de logs
    ROLES_GUILD_ID: process.env.ROLES_GUILD_ID || process.env.GUILD_ID, // Serveur où se trouvent les rôles Staff
    WEBHOOK_URL: process.env.WEBHOOK_URL,
    GSS_WEBHOOK_URL: 'https://discord.com/api/webhooks/1564323221917016204/frIDxLVniplw9OhAJR6Z_b-PkPWwwsOpkvYKLc6kK2FZwLHceEEED_TkIq_VXf6JKvi1',
    PING_ROLE_ID: process.env.PING_ROLE_ID || '1540491025045266525',
    ROLES: {
        GAP: process.env.ROLE_GAP,
        GSE: process.env.ROLE_GSE,
        GM: process.env.ROLE_GM,
        GS: process.env.ROLE_GS,
        GSS: process.env.ROLE_GSS,
        GAC: process.env.ROLE_GAC
    }
};

const client = new Client({ checkUpdate: false });

const ROLE_NAMES = {
    GAP: 'Gestion Abus',
    GSE: 'Gestion Serveur',
    GAC: 'Gestion Activité',
    GM: 'Gestion Modération',
    GS: 'Gestion Staff',
    GSS: 'Gestion Sécurité'
};

const stats = {
    users: new Map(),
    roles: { GAP: 0, GSE: 0, GM: 0, GS: 0, GSS: 0, GAC: 0 },
    total: 0,
    cache: new Map(),
    processed: new Set()
};

const fs = require('fs');
const path = require('path');
const RANK_FILE = path.join(__dirname, 'rank_message.json');

function loadRankData() {
    try {
        if (fs.existsSync(RANK_FILE)) {
            return JSON.parse(fs.readFileSync(RANK_FILE, 'utf8'));
        }
    } catch (e) { }
    return {};
}

function saveRankData(data) {
    try {
        const current = loadRankData();
        fs.writeFileSync(RANK_FILE, JSON.stringify({ ...current, ...data }), 'utf8');
    } catch (e) { }
}

const _initialData = loadRankData();
let rankMessageId = _initialData.rankMessageId || null;
let gssMessageId = _initialData.gssMessageId || null;

/* ===================== UTILS ===================== */
async function getMember(id, guild) {
    if (!guild) return null;
    if (stats.cache.has(id)) return stats.cache.get(id);
    const m = await guild.members.fetch({ user: id, force: true }).catch((err) => {
        console.error(`⚠️ Impossible de fetch le membre ${id} sur le serveur ${guild.name}:`, err.message);
        return null;
    });
    if (m) {
        stats.cache.set(id, m);
    } else {
        console.log(`⚠️ Membre ${id} non trouvé sur le serveur ${guild.name}`);
    }
    return m;
}

/* ===================== PARSE ===================== */
async function handleMessage(msg, guild) {
    if (stats.processed.has(msg.id)) return;
    stats.processed.add(msg.id);

    const embed = msg.embeds?.[0];
    if (!embed?.description) return;

    const desc = embed.description.toLowerCase();
    if (desc.includes('automatique')) return;

    const lineExec = embed.description
        .split('\n')
        .find(l => l.toLowerCase().includes('exécutant'));
    if (!lineExec) {
        console.log(`⏭️ Embed ignoré (pas de ligne 'exécutant') — début desc: ${desc.substring(0, 80)}`);
        return;
    }

    const match = lineExec.match(/\d{17,20}/);
    if (!match) {
        console.log(`⏭️ Embed ignoré (pas d'ID dans la ligne exécutant) : ${lineExec}`);
        return;
    }

    const id = match[0];
    let action = 0;

    // Detection des actions (libéré / unjail / jaillé / recruté)
    if (desc.includes('libéré + recruté') || desc.includes('libere + recrute') || desc.includes('jaillé + recruté') || desc.includes('jail + recrute')) {
        action = 2;
    } else if (desc.includes('libéré') || desc.includes('libere') || desc.includes('jaillé') || desc.includes('jail') || desc.includes('unjail')) {
        action = 1;
    }

    if (!action) {
        console.log(`⏭️ Embed ignoré (aucun mot-clé d'action) — début desc: ${desc.substring(0, 100)}`);
        return;
    }
    console.log(`✔️ Action détectée → id: ${id}, action: ${action}`);

    const member = await getMember(id, guild);

    if (!stats.users.has(id)) {
        // Déterminer le rôle du membre dès le premier enregistrement
        let memberRole = null;
        if (member) {
            for (const [role, roleId] of Object.entries(CONFIG.ROLES)) {
                if (roleId && member.roles.cache.has(roleId)) {
                    memberRole = role;
                    break;
                }
            }
        }
        stats.users.set(id, {
            tag: member ? member.user.tag : id,
            lib: 0,
            rec: 0,
            total: 0,
            role: memberRole
        });
    }

    const u = stats.users.get(id);
    // Mettre à jour le rôle si non défini
    if (!u.role && member) {
        for (const [role, roleId] of Object.entries(CONFIG.ROLES)) {
            if (roleId && member.roles.cache.has(roleId)) {
                u.role = role;
                break;
            }
        }
    }

    if (action === 2) {
        u.lib++;
        u.rec++;
    } else {
        u.lib++;
    }

    u.total += action;
    stats.total += action;

    if (member) {
        let roleFound = false;
        for (const [role, roleId] of Object.entries(CONFIG.ROLES)) {
            if (roleId && member.roles.cache.has(roleId)) {
                stats.roles[role] += action;
                roleFound = true;
                break;
            }
        }
        if (!roleFound) {
            console.log(`ℹ️ Membre ${member.user?.tag || id} trouvé mais n'a aucun des rôles configurés. Ses rôles: ${[...member.roles.cache.keys()].join(', ')}`);
        }
    }
}

/* ===================== SCAN ===================== */
async function scan(channel, guild) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    let before = null;
    console.log('🔍 Scan initial des messages du jour en cours...');

    try {
        while (true) {
            const msgs = await channel.messages.fetch({
                limit: 100,
                ...(before ? { before } : {})
            }).catch(err => {
                console.error('⚠️ Impossible de lire les messages du salon (Vérifiez les permissions "Voir l\'historique des messages"):', err.message);
                return null;
            });

            if (!msgs || !msgs.size) break;

            for (const msg of msgs.values()) {
                if (msg.createdTimestamp < start.getTime()) return;
                await handleMessage(msg, guild);
            }

            before = msgs.last().id;
        }
    } catch (err) {
        console.error('⚠️ Erreur durant le scan :', err.message);
    }
}

/* ===================== EMBED ===================== */
function buildPayload(isFinal = false) {
    const users = [...stats.users.entries()]
        .sort((a, b) => {
            if (b[1].total !== a[1].total) return b[1].total - a[1].total;
            return b[1].rec - a[1].rec;
        })
        .slice(0, 5);

    const medals = [
        '👑 CHAMPION',
        '💎 VICE-CHAMPION',
        '🔥 TROISIÈME',
        '⚡ 4ÈME PLACE',
        '✨ 5ÈME PLACE'
    ];

    let description = '';

    if (users.length === 0) {
        description = '*Aucune action enregistrée pour le moment.*\n\n';
    } else {
        users.forEach(([id, u], i) => {
            description += `**${medals[i]}**\n`;
            description += `└ <@${id}>\n`;
            description += `> **${u.total}** actions\n`;
            description += `> ${u.lib} unjails • ${u.rec} grabs\n\n`;
        });
    }

    const totalLib = [...stats.users.values()].reduce((a, b) => a + b.lib, 0);
    const totalRec = [...stats.users.values()].reduce((a, b) => a + b.rec, 0);
    const participants = stats.users.size;
    const avg = participants > 0 ? (stats.total / participants).toFixed(1) : '0.0';

    description += `────────────────────\n`;
    description += `📌 **${totalLib}** unjails • **${totalRec}** grabs\n`;
    description += `👥 **${participants}** participants • 📊 **${avg}** moy/pers\n\n`;
    description += `📊 **CLASSEMENT DES GESTIONS**\n`;

    const roles = Object.entries(stats.roles).sort((a, b) => b[1] - a[1]);
    roles.forEach(([role, count], i) => {
        const name = ROLE_NAMES[role] || role;
        description += `\`${i + 1}.\` **${name}** — **${count}**\n`;
    });

    let contentText = '🏆 **TOP QUOTIDIEN**';
    if (isFinal && CONFIG.PING_ROLE_ID) {
        contentText = `🏆 **TOP QUOTIDIEN CLÔTURÉ** • <@&${CONFIG.PING_ROLE_ID}>`;
    }

    return {
        content: contentText,
        allowed_mentions: { roles: CONFIG.PING_ROLE_ID ? [CONFIG.PING_ROLE_ID] : [] },
        embeds: [{
            description: description,
            color: isFinal ? 0xffd700 : 0x2b2d31,
            footer: {
                text: isFinal ? 'Shibuya • Classement définitif clôturé à 00:00' : 'Shibuya • Mis à jour automatiquement'
            },
            timestamp: new Date().toISOString()
        }]
    };
}

/* ===================== EMBED GSS ===================== */
function buildGSSPayload(isFinal = false) {
    // Filtrer uniquement les membres GSS
    const gssUsers = [...stats.users.entries()]
        .filter(([, u]) => u.role === 'GSS')
        .sort((a, b) => {
            if (b[1].total !== a[1].total) return b[1].total - a[1].total;
            return b[1].rec - a[1].rec;
        })
        .slice(0, 5);

    const medals = [
        '👑 CHAMPION',
        '💎 VICE-CHAMPION',
        '🔥 TROISIÈME',
        '⚡ 4ÈME PLACE',
        '✨ 5ÈME PLACE'
    ];

    let description = '';

    if (gssUsers.length === 0) {
        description = '*Aucune action GSS enregistrée pour le moment.*\n\n';
    } else {
        gssUsers.forEach(([id, u], i) => {
            description += `**${medals[i]}**\n`;
            description += `└ <@${id}>\n`;
            description += `> **${u.total}** actions\n`;
            description += `> ${u.lib} unjails • ${u.rec} grabs\n\n`;
        });
    }

    const gssAllUsers = [...stats.users.entries()].filter(([, u]) => u.role === 'GSS').map(([, u]) => u);
    const totalLib = gssAllUsers.reduce((a, b) => a + b.lib, 0);
    const totalRec = gssAllUsers.reduce((a, b) => a + b.rec, 0);
    const totalActions = gssAllUsers.reduce((a, b) => a + b.total, 0);
    const participants = gssAllUsers.length;
    const avg = participants > 0 ? (totalActions / participants).toFixed(1) : '0.0';

    description += `────────────────────\n`;
    description += `📌 **${totalLib}** unjails • **${totalRec}** grabs\n`;
    description += `👥 **${participants}** participants • 📊 **${avg}** moy/pers\n`;

    const contentText = isFinal
        ? '🔒 **TOP GSS CLÔTURÉ**'
        : '🛡️ **TOP GESTION SÉCURITÉ**';

    return {
        content: contentText,
        embeds: [{
            description: description,
            color: isFinal ? 0xffd700 : 0x5865f2,
            footer: {
                text: isFinal ? 'Shibuya • Classement GSS définitif clôturé à 00:00' : 'Shibuya • Classement GSS mis à jour automatiquement'
            },
            timestamp: new Date().toISOString()
        }]
    };
}

/* ===================== UPDATE VIA WEBHOOK ===================== */
async function updateRankMessage(isFinal = false) {
    try {
        const payload = buildPayload(isFinal);
        console.log(`📊 Stats actuelles → total: ${stats.total}, participants: ${stats.users.size}, rankMessageId: ${rankMessageId}`);

        if (rankMessageId) {
            // Éditer le message existant via Webhook
            const res = await fetch(`${CONFIG.WEBHOOK_URL}/messages/${rankMessageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            console.log(`🔁 PATCH webhook → HTTP ${res.status}`);

            if (res.ok) {
                console.log(isFinal ? '🏆 Classement final clôturé et ping envoyé !' : '✅ Classement mis à jour');
                return;
            } else {
                const errText = await res.text();
                console.log(`⚠️ PATCH échoué (${res.status}) : ${errText} — tentative de création d'un nouveau message...`);
                rankMessageId = null;
            }
        }

        // Créer un nouveau message si absent
        const res = await fetch(CONFIG.WEBHOOK_URL + '?wait=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log(`📨 POST webhook → HTTP ${res.status}`);

        if (res.ok) {
            const data = await res.json();
            rankMessageId = data.id;
            saveRankData({ rankMessageId });
            console.log(`✨ Nouveau message de classement créé (ID: ${rankMessageId})`);
        } else {
            console.log('❌ Erreur webhook :', await res.text());
        }
    } catch (err) {
        console.error('❌ Erreur update classement :', err.message);
    }
}

/* ===================== UPDATE GSS VIA WEBHOOK ===================== */
async function updateGSSRankMessage(isFinal = false) {
    try {
        const payload = buildGSSPayload(isFinal);
        const gssCount = [...stats.users.values()].filter(u => u.role === 'GSS').length;
        console.log(`🛡️ GSS Stats → participants: ${gssCount}, gssMessageId: ${gssMessageId}`);

        if (gssMessageId) {
            const res = await fetch(`${CONFIG.GSS_WEBHOOK_URL}/messages/${gssMessageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            console.log(`🔁 PATCH GSS webhook → HTTP ${res.status}`);

            if (res.ok) {
                console.log(isFinal ? '🏆 Classement GSS final clôturé !' : '✅ Classement GSS mis à jour');
                return;
            } else {
                const errText = await res.text();
                console.log(`⚠️ PATCH GSS échoué (${res.status}) : ${errText} — tentative de création d'un nouveau message GSS...`);
                gssMessageId = null;
            }
        }

        const res = await fetch(CONFIG.GSS_WEBHOOK_URL + '?wait=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log(`📨 POST GSS webhook → HTTP ${res.status}`);

        if (res.ok) {
            const data = await res.json();
            gssMessageId = data.id;
            saveRankData({ gssMessageId });
            console.log(`✨ Nouveau message de classement GSS créé (ID: ${gssMessageId})`);
        } else {
            console.log('❌ Erreur GSS webhook :', await res.text());
        }
    } catch (err) {
        console.error('❌ Erreur update classement GSS :', err.message);
    }
}

/* ===================== MIDNIGHT RESET ===================== */
function scheduleMidnightReset() {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0); // 00:00:00 du jour suivant
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    console.log(`⏰ Prochaine réinitialisation de minuit dans ${(msUntilMidnight / 3600000).toFixed(2)} heures.`);

    setTimeout(async () => {
        console.log('🌙 Réinitialisation de minuit en cours...');

        // 1. Clôturer et pinger le rôle sur le dernier classement de la journée écoulée
        await updateRankMessage(true);
        await updateGSSRankMessage(true);

        // 2. Réinitialiser les compteurs
        stats.users.clear();
        stats.roles = { GAP: 0, GSE: 0, GM: 0, GS: 0, GSS: 0, GAC: 0 };
        stats.total = 0;
        stats.cache.clear();
        stats.processed.clear();

        // 3. Réinitialiser l'ID du message pour créer un nouveau classement le jour suivant
        rankMessageId = null;
        gssMessageId = null;
        saveRankData({ rankMessageId: null, gssMessageId: null });

        // 4. Poster le nouvel embed vierge pour la nouvelle journée
        await updateRankMessage(false);
        await updateGSSRankMessage(false);

        console.log('✨ Nouveau jour démarré ! Classement réinitialisé.');

        // Programmer le minuit suivant
        scheduleMidnightReset();
    }, msUntilMidnight);
}

/* ===================== READY ===================== */
let readyOnce = false;

client.on('ready', async () => {
    if (readyOnce) return;
    readyOnce = true;

    console.log(`🤖 Connecté en tant que ${client.user.tag}`);

    const channel = await client.channels.fetch(CONFIG.CHANNEL_ID).catch(() => null);

    // Fetch explicite du serveur pour s'assurer que les membres et rôles sont accessibles
    const guildId = CONFIG.ROLES_GUILD_ID || CONFIG.GUILD_ID;
    const rolesGuild = await client.guilds.fetch(guildId).catch(() => null)
        || client.guilds.cache.get(guildId);

    if (!channel) {
        console.log('❌ Configuration invalide : Salon de logs introuvable.');
        process.exit(1);
    }

    if (!rolesGuild) {
        console.log('⚠️ Avertissement : Serveur des rôles introuvable — les compteurs de gestions resteront à 0.');
    } else {
        console.log(`✅ Serveur des rôles chargé : ${rolesGuild.name} (${rolesGuild.id})`);
    }

    await scan(channel, rolesGuild);
    await updateRankMessage();
    await updateGSSRankMessage();

    // Démarrer la planification du reset à minuit
    scheduleMidnightReset();

    console.log('🟢 Bot prêt — Classement en direct actif');
});

/* ===================== COMMANDS ===================== */
client.on('messageCreate', async (msg) => {
    const content = msg.content.trim().toLowerCase();

    // Commande /debug : force le repost du classement (uniquement le compte selfbot)
    if (msg.author.id === client.user.id && content === '/debug') {
        console.log('🔧 Commande /debug reçue — repost forcé du classement...');
        await msg.delete().catch(() => { });
        rankMessageId = null;
        saveRankData({ rankMessageId: null });
        await updateRankMessage();
        console.log('✅ Classement reposté via /debug');
        return;
    }

    // Commande +classement : force le repost du classement (accessible à tous)
    if (content === '+classement') {
        console.log(`🔧 Commande +classement reçue par ${msg.author.tag} — repost forcé...`);
        // Supprimer le message de commande pour garder le salon propre
        await msg.delete().catch(() => { });
        // Réinitialiser l'ID pour forcer la création d'un nouveau message
        rankMessageId = null;
        saveRankData({ rankMessageId: null });
        // Repost avec les stats actuelles
        await updateRankMessage();
        console.log('✅ Classement reposté via +classement');
        return;
    }

    /* ===================== LIVE ===================== */
    if (msg.channel.id !== CONFIG.CHANNEL_ID) return;

    const rolesGuild = client.guilds.cache.get(CONFIG.ROLES_GUILD_ID) || client.guilds.cache.get(CONFIG.GUILD_ID);

    const prevTotal = stats.total;
    await handleMessage(msg, rolesGuild);

    // Mettre à jour l'embed UNIQUEMENT si une nouvelle action (unjail/jail) a été enregistrée
    if (stats.total > prevTotal) {
        await updateRankMessage();
        await updateGSSRankMessage();
    }
});

client.on('error', (err) => console.error('⚠️ Erreur Discord Client :', err.message));

// Connexion du bot
client.login(CONFIG.TOKEN);
