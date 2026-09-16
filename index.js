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
    PING_ROLE_ID: process.env.PING_ROLE_ID || '1540491025045266525',
    ROLES: {
        GAP: process.env.ROLE_GAP,
        GSE: process.env.ROLE_GSE,
        GM: process.env.ROLE_GM,
        GS: process.env.ROLE_GS,
        ADS: process.env.ROLE_ADS,
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
    ADS: 'Gestion ADS'
};

const stats = {
    users: new Map(),
    roles: { GAP: 0, GSE: 0, GM: 0, GS: 0, ADS: 0, GAC: 0 },
    total: 0,
    cache: new Map(),
    processed: new Set()
};

const fs = require('fs');
const path = require('path');
const RANK_FILE = path.join(__dirname, 'rank_message.json');

function loadRankMessageId() {
    try {
        if (fs.existsSync(RANK_FILE)) {
            const data = JSON.parse(fs.readFileSync(RANK_FILE, 'utf8'));
            return data.rankMessageId || null;
        }
    } catch (e) {}
    return null;
}

function saveRankMessageId(id) {
    try {
        fs.writeFileSync(RANK_FILE, JSON.stringify({ rankMessageId: id }), 'utf8');
    } catch (e) {}
}

let rankMessageId = loadRankMessageId();

/* ===================== UTILS ===================== */
async function getMember(id, guild) {
    if (stats.cache.has(id)) return stats.cache.get(id);
    const m = await guild.members.fetch(id).catch(() => null);
    if (m) stats.cache.set(id, m);
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
    if (!lineExec) return;

    const match = lineExec.match(/\d{17,20}/);
    if (!match) return;

    const id = match[0];
    let action = 0;

    // Detection des actions (libéré / unjail / jaillé / recruté)
    if (desc.includes('libéré + recruté') || desc.includes('libere + recrute') || desc.includes('jaillé + recruté') || desc.includes('jail + recrute')) {
        action = 2;
    } else if (desc.includes('libéré') || desc.includes('libere') || desc.includes('jaillé') || desc.includes('jail') || desc.includes('unjail')) {
        action = 1;
    }
    
    if (!action) return;

    const member = await getMember(id, guild);

    if (!stats.users.has(id)) {
        stats.users.set(id, {
            tag: member ? member.user.tag : id,
            lib: 0,
            rec: 0,
            total: 0
        });
    }

    const u = stats.users.get(id);

    if (action === 2) {
        u.lib++;
        u.rec++;
    } else {
        u.lib++;
    }

    u.total += action;
    stats.total += action;

    if (member) {
        for (const [role, roleId] of Object.entries(CONFIG.ROLES)) {
            if (roleId && member.roles.cache.has(roleId)) {
                stats.roles[role] += action;
                break;
            }
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

/* ===================== UPDATE VIA WEBHOOK ===================== */
async function updateRankMessage(isFinal = false) {
    try {
        const payload = buildPayload(isFinal);

        if (rankMessageId) {
            // Éditer le message existant via Webhook
            const res = await fetch(`${CONFIG.WEBHOOK_URL}/messages/${rankMessageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                console.log(isFinal ? '🏆 Classement final clôturé et ping envoyé !' : '✅ Classement mis à jour');
                return;
            }
        }

        // Créer un nouveau message si absent
        const res = await fetch(CONFIG.WEBHOOK_URL + '?wait=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            rankMessageId = data.id;
            saveRankMessageId(rankMessageId);
            console.log('✨ Nouveau message de classement créé');
        } else {
            console.log('❌ Erreur webhook :', await res.text());
        }
    } catch (err) {
        console.error('❌ Erreur update classement :', err.message);
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

        // 2. Réinitialiser les compteurs
        stats.users.clear();
        stats.roles = { GAP: 0, GSE: 0, GM: 0, GS: 0, ADS: 0, GAC: 0 };
        stats.total = 0;
        stats.cache.clear();
        stats.processed.clear();

        // 3. Réinitialiser l'ID du message pour créer un nouveau classement le jour suivant
        rankMessageId = null;
        saveRankMessageId(null);

        // 4. Poster le nouvel embed vierge pour la nouvelle journée
        await updateRankMessage(false);

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
        console.log(`✅ Serveur des rôles chargé : ${rolesGuild.name}`);
    }

    await scan(channel, rolesGuild);
    await updateRankMessage();

    // Démarrer la planification du reset à minuit
    scheduleMidnightReset();

    console.log('🟢 Bot prêt — Classement en direct actif');
});

/* ===================== DEBUG COMMAND ===================== */
client.on('messageCreate', async (msg) => {
    // Commande /debug : force le repost du classement (uniquement le compte selfbot)
    if (msg.author.id === client.user.id && msg.content.trim().toLowerCase() === '/debug') {
        console.log('🔧 Commande /debug reçue — repost forcé du classement...');
        // Supprimer le message /debug pour garder le salon propre
        await msg.delete().catch(() => {});
        // Réinitialiser l'ID pour forcer la création d'un nouveau message
        rankMessageId = null;
        saveRankMessageId(null);
        // Repost avec les stats actuelles
        await updateRankMessage();
        console.log('✅ Classement reposté via /debug');
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
    }
});

client.on('error', (err) => console.error('⚠️ Erreur Discord Client :', err.message));

// Connexion du bot
client.login(CONFIG.TOKEN);
