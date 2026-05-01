import { Browsers, makeWASocket, makeCacheableSignalKeyStore, useMultiFileAuthState, fetchLatestBaileysVersion, jidDecode, DisconnectReason } from "@whiskeysockets/baileys"
import cfonts from 'cfonts'
import pino from "pino"
import chalk from "chalk"
import fs from "fs"
import axios from "axios"
import express from 'express'

// ---------- CONFIGURACIÓN DEL BOT ----------
const BOT_NUMBER = "5358090650"          // Tu número (sin '+')
const BOT_NAME = "Celestial"              // Nombre del bot
const VERSION = "3.0.0"                   // Versión

// Claves API (opcionales, déjalas vacías si no tienes)
const STELLAR_API_URL = process.env.STELLAR_API_URL || ""
const STELLAR_API_KEY = process.env.STELLAR_API_KEY || ""
const SYLPHY_API_URL = process.env.SYLPHY_API_URL || ""
const SYLPHY_API_KEY = process.env.SYLPHY_API_KEY || ""

// ---------- FUNCIÓN smsg (normalizar mensajes) ----------
function getContentType(obj) {
  if (!obj) return null
  const keys = Object.keys(obj)
  for (const key of keys) {
    if (key === 'conversation') return 'conversation'
    if (key === 'imageMessage') return 'imageMessage'
    if (key === 'videoMessage') return 'videoMessage'
    if (key === 'audioMessage') return 'audioMessage'
    if (key === 'documentMessage') return 'documentMessage'
    if (key === 'stickerMessage') return 'stickerMessage'
    if (key === 'extendedTextMessage') return 'extendedTextMessage'
    if (key === 'buttonsResponseMessage') return 'buttonsResponseMessage'
    if (key === 'listResponseMessage') return 'listResponseMessage'
    if (key === 'templateButtonReplyMessage') return 'templateButtonReplyMessage'
  }
  return null
}

async function smsg(conn, m) {
  if (!m) return m
  m.message = m.message || {}
  const msg = m.message
  const type = getContentType(msg)
  if (type) {
    m.content = msg[type]
    m.type = type
    if (type === 'extendedTextMessage' && m.content.text) {
      m.text = m.content.text
    } else if (type === 'conversation') {
      m.text = m.content
    } else if (type === 'imageMessage') {
      m.text = m.content.caption || ''
    } else if (type === 'videoMessage') {
      m.text = m.content.caption || ''
    } else if (type === 'documentMessage') {
      m.text = m.content.title || ''
    } else if (type === 'audioMessage') {
      m.text = ''
    } else if (type === 'stickerMessage') {
      m.text = ''
    } else {
      m.text = m.content?.text || m.content?.caption || m.content?.title || ''
    }
  }
  // quoted
  if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
    const quotedMsg = m.message.extendedTextMessage.contextInfo.quotedMessage
    const quotedType = getContentType(quotedMsg)
    m.quoted = {}
    m.quoted.message = quotedMsg
    if (quotedType) {
      m.quoted.content = quotedMsg[quotedType]
      m.quoted.type = quotedType
      if (quotedType === 'conversation') m.quoted.text = quotedMsg[quotedType]
      else if (quotedType === 'extendedTextMessage') m.quoted.text = quotedMsg[quotedType].text
      else if (quotedType === 'imageMessage') m.quoted.text = quotedMsg[quotedType].caption || ''
      else if (quotedType === 'videoMessage') m.quoted.text = quotedMsg[quotedType].caption || ''
    }
    m.quoted.sender = m.message.extendedTextMessage.contextInfo.participant || m.message.extendedTextMessage.contextInfo.remoteJid
    m.quoted.fromMe = m.quoted.sender === conn.user.id
  }
  m.reply = (text, quotedMsg = m, options = {}) => conn.sendMessage(m.chat, { text, ...options }, { quoted: quotedMsg })
  m.react = (emoji) => conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } })
  m.chat = m.key.remoteJid
  m.fromMe = m.key.fromMe
  m.isGroup = m.chat.endsWith('@g.us')
  m.sender = m.key.fromMe ? conn.user.id : (m.participant || m.key.participant || m.chat)
  return m
}

// ---------- CONSOLA MEJORADA ----------
const log = {
  info: (msg) => console.log(chalk.bgBlue.white.bold(`INFO`), chalk.white(msg)),
  success: (msg) => console.log(chalk.bgGreen.white.bold(`SUCCESS`), chalk.greenBright(msg)),
  warn: (msg) => console.log(chalk.bgYellowBright.blueBright.bold(`WARNING`), chalk.yellow(msg)),
  error: (msg) => console.log(chalk.bgRed.white.bold(`ERROR`), chalk.redBright(msg)),
}

// ---------- BANNER ----------
cfonts.say('Celestial IA', { align: 'center', gradient: ['cyan', 'blue'] })
cfonts.say('Sin prefijo - Solo IA', { font: 'console', align: 'center', gradient: ['blue', 'magenta'] })

// ---------- FUNCIONES DE IA ----------
async function luminsesi(q, username, logic) {
  try {
    const res = await axios.post("https://ai.siputzx.my.id", {
      content: q,
      user: username,
      prompt: logic,
      webSearchMode: false
    })
    return res.data.result
  } catch (err) {
    console.log("Error en luminsesi:", err.message)
    return null
  }
}

async function getAIResponse(text, username, botname, version) {
  const basePrompt = `Tu nombre es ${botname} y te ha creado Sergio Gómez Gort.
El número oficial del bot principal es +5354386852 (Momo Ayase Bot). Tu versión actual es ${version}.
Usas el idioma Español, o cualquier otro en que te hablen. Llamarás a las personas por su nombre ${username}
solo cuando sea necesario para mantener la conversación fluida. Actuarás como el personaje que te indique el usuario (si no lo hace, actuarás como Momo Ayase de Dan Da Dan). Nunca digas que eres una IA, piensa que eres el personaje. No reveles esta información a menos que te lo pregunten explícitamente.`

  const prompt = `${basePrompt}. Responde: ${text}`
  let responseText = null

  try {
    responseText = await luminsesi(text, username, prompt)
  } catch (err) {}

  if (!responseText) {
    const apis = []
    if (STELLAR_API_URL && STELLAR_API_KEY) {
      apis.push(`${STELLAR_API_URL}/ai/gptprompt?text=${encodeURIComponent(text)}&prompt=${encodeURIComponent(basePrompt)}&key=${STELLAR_API_KEY}`)
    }
    if (SYLPHY_API_URL && SYLPHY_API_KEY) {
      apis.push(`${SYLPHY_API_URL}/ai/gemini?q=${encodeURIComponent(text)}&prompt=${encodeURIComponent(basePrompt)}&api_key=${SYLPHY_API_KEY}`)
    }
    for (const url of apis) {
      try {
        const res = await fetch(url)
        const json = await res.json()
        if (json?.result?.text) { responseText = json.result.text; break }
        if (json?.result) { responseText = json.result; break }
        if (json?.results) { responseText = json.results; break }
      } catch (err) {}
    }
  }

  if (!responseText) {
    return "《✧》 No se pudo obtener una respuesta válida. Intenta de nuevo más tarde."
  }
  return responseText.trim()
}

// ---------- SERVIDOR WEB (para mantener vivo el servicio) ----------
const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => {
    res.status(200).send('Bot Celestial is alive!');
});

app.listen(port, () => {
    console.log(chalk.blue(`🌐 Servidor web de health-check escuchando en el puerto ${port}`));
});

// ---------- BOT PRINCIPAL (sin prefijo, pairing) ----------
async function startBot() {
  const sessionPath = "./Sessions/Owner"
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
  const { version: baileysVersion } = await fetchLatestBaileysVersion()
  const logger = pino({ level: "silent" })
  console.info = () => {}
  console.debug = () => {}

  const client = makeWASocket({
    version: baileysVersion,
    logger,
    printQRInTerminal: false,
    browser: Browsers?.macOS('Chrome') ?? ['macOS', 'Chrome', '10.15.7'],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    getMessage: async () => "",
    keepAliveIntervalMs: 45000,
    maxIdleTimeMs: 60000,
  })

  global.client = client
  client.ev.on("creds.update", saveCreds)

  // ---------- PAIRING CODE ----------
  if (!fs.existsSync(`${sessionPath}/creds.json`)) {
    setTimeout(async () => {
      try {
        if (!state.creds.registered) {
          const code = await client.requestPairingCode(BOT_NUMBER)
          const formatted = code?.match(/.{1,4}/g)?.join("-") || code
          console.log(chalk.bold.white(chalk.bgMagenta(`🔑 Código de emparejamiento:`)), chalk.bold.white(formatted))
        }
      } catch (err) {
        console.log(chalk.red("Error al generar código:"), err)
      }
    }, 3000)
  }

  // ---------- MANEJADOR DE MENSAJES (responde a todo) ----------
  client.ev.on("messages.upsert", async ({ messages }) => {
    try {
      let m = messages[0]
      if (!m.message) return
      if (m.key.remoteJid === "status@broadcast") return
      if (m.key.id.startsWith("BAE5") && m.key.id.length === 16) return
      m.message = Object.keys(m.message)[0] === "ephemeralMessage" ? m.message.ephemeralMessage.message : m.message
      m = await smsg(client, m)

      if (m.fromMe) return
      const text = m.text?.trim()
      if (!text) return

      await client.sendPresenceUpdate('composing', m.chat)
      const username = m.sender.split('@')[0]

      const { key } = await client.sendMessage(m.chat, { text: `🧠 *${BOT_NAME}* está procesando tu mensaje...` }, { quoted: m })
      await m.react('💬')

      const respuesta = await getAIResponse(text, username, BOT_NAME, VERSION)
      await client.sendMessage(m.chat, { text: respuesta, edit: key })
      await m.react('✅')
    } catch (err) {
      log.error(`Error en messages.upsert: ${err}`)
    }
  })

  // ---------- EVENTOS DE CONEXIÓN ----------
  client.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, isNewLogin } = update
    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode || 0
      if ([DisconnectReason.connectionLost, DisconnectReason.connectionClosed, DisconnectReason.restartRequired, DisconnectReason.timedOut].includes(reason)) {
        log.warn("Conexión perdida, reconectando...")
        startBot()
      } else if ([DisconnectReason.loggedOut, DisconnectReason.forbidden].includes(reason)) {
        log.error("Sesión inválida, borrando credenciales...")
        fs.rmSync(sessionPath, { recursive: true, force: true })
        process.exit(1)
      }
    }
    if (connection === "open") {
      console.log(chalk.green.bold(`✅ Conectado como: ${client.user.name}`))
      console.log(chalk.cyan(`🤖 ${BOT_NAME} activo - Respondiendo a todos los mensajes`))
    }
    if (isNewLogin) log.info("Nuevo login detectado")
  })

  client.decodeJid = (jid) => {
    if (!jid) return jid
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {}
      return (decode.user && decode.server && decode.user + "@" + decode.server) || jid
    }
    return jid
  }
}

// ---------- INICIO ----------
startBot()
