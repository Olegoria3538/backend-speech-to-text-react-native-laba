"use strict"

const Hapi = require("@hapi/hapi") //библиотека для апи
const fs = require("fs") //для чтение файлов
const speech = require("@google-cloud/speech") //google speech
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path //ffmpeg для форматирования файла в wav
const ffmpeg = require("fluent-ffmpeg")
ffmpeg.setFfmpegPath(ffmpegPath)

const client = new speech.SpeechClient() //сощдаем гугл клиента

const init = async () => {
  //инициализируем
  const server = Hapi.server({
    port: 3005,
    host: "192.168.0.35",
  })

  server.route({
    //тест по гет запросу
    method: "GET",
    path: "/speech",
    handler: (request, h) => {
      return "Hello World!"
    },
  })

  server.route({
    //пост запрос
    method: "POST",
    path: "/speech",
    config: {
      handler: async (request, h) => {
        const data = request.payload
        if (data.file) {
          const name = data.file.hapi.filename //записываем файл в uploads
          const path = __dirname + "/uploads/" + name
          const encodedPath = __dirname + "/uploads/encoded_" + name
          const file = fs.createWriteStream(path)

          file.on("error", (err) => console.error(err))

          data.file.pipe(file)

          return new Promise((resolve) => {
            //тут мы форматируем файл и отправляем его на обраобтку
            data.file.on("end", async (err) => {
              ffmpeg()
                .input(path)
                .outputOptions([
                  "-f s16le",
                  "-acodec pcm_s16le",
                  "-vn",
                  "-ac 1",
                  "-ar 41k",
                  "-map_metadata -1",
                ])
                .save(encodedPath)
                .on("end", async () => {
                  const savedFile = fs.readFileSync(encodedPath)

                  const audioBytes = savedFile.toString("base64")
                  const audio = {
                    content: audioBytes,
                  }
                  const sttConfig = {
                    enableAutomaticPunctuation: false,
                    encoding: "LINEAR16",
                    sampleRateHertz: 41000,
                    languageCode: "ru-RU",
                    model: "default",
                  }

                  const request = {
                    audio: audio,
                    config: sttConfig,
                  }

                  const [response] = await client.recognize(request)
                  const transcription = response.results
                    .map((result) => result.alternatives[0].transcript)
                    .join("\n")

                  fs.unlinkSync(path)
                  fs.unlinkSync(encodedPath)
                  resolve(JSON.stringify({ data: transcription })) //возращаем результат
                })
            })
          })
        }
      },
      payload: {
        output: "stream",
        parse: true,
      },
    },
  })

  await server.start()
  console.log("start")
}

process.on("unhandledRejection", (err) => {
  console.log(err)
})

init()
