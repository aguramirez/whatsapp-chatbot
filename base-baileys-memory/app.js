const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')

const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')
const axios = require('axios');
const path = require('path')
const fs = require('fs')

const promptPath = path.join(__dirname, 'txts', 'prompt.txt');
const prompt = fs.readFileSync(promptPath, 'utf-8');
const menuPath = path.join(__dirname, 'txts', 'menu.txt');
const menu = fs.readFileSync(menuPath, 'utf-8');


const flowPrincipal = addKeyword(EVENTS.WELCOME, "menu")
    .addAction(async (ctx, { flowDynamic }) => {
        return await flowDynamic(`🙌 Hola ${ctx.pushName} bienvenido/a a esta peluqueria 💇‍♂️💈💇‍♀️`)
    })
    .addAnswer('En que le podemos ayudar hoy?', { delay: 500 })
    .addAnswer(menu,
        { capture: true, delay: 1000 },
        async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
            if (!["1", "2", "3", "4", "0"].includes(ctx.body)) {
                return fallBack();
            }
            switch (ctx.body) {
                case "1":
                    return gotoFlow(flowReserva);
                case "2":
                    return gotoFlow(flowVerReserva);
                case "3":
                    return gotoFlow(flowCancelar);
                case "4":
                    return gotoFlow(flowConsultas);
                case "0":
                    return await flowDynamic(
                        "Saliendo... Puedes volver a acceder a este menú escribiendo '*Menu*'"
                    );
            }
        }
    )

const flowReserva = addKeyword(EVENTS.ACTION)
    .addAnswer("Estos son los 3 proximos turnos disponibles:", null,
        async (ctx, { state, flowDynamic }) => {
            await state.update({ name: ctx.pushName })
            await state.update({ description: ctx.from })
            try {
                const response = await axios.post("http://localhost:3001/next-available-slots",
                    // { resd: 'ola' },
                    { headers: { 'Content-Type': 'application/json' } }
                )

                await state.update({ fechasISO: response.data.fechasISO })
                const mensaje = response.data.slots
                    .map((fecha, index) => `${index + 1} - ${fecha}`)
                    // .concat('0 - elegir otra')
                    .join('\n');
                const mensajeCompleto = `Elige alguna:\n${mensaje}`;
                await flowDynamic(mensajeCompleto)
            } catch (error) {
                if (error.isAxiosError) {
                    console.error('Error en Axios');
                } else {
                    console.error(error)
                }
            }

        }
    ).addAnswer("Sino decinos otra fecha especificando hora con am/pm 👇", { capture: true },
        async (ctx, { state, flowDynamic, fallBack, gotoFlow }) => {
            const { fechasISO } = state.getMyState()
            // console.log(fechasISO)
            let fecha = null;
            switch (ctx.body) {
                case "1":
                    fecha = fechasISO[0]
                    break
                case "2":
                    fecha = fechasISO[1]
                    break
                case "3":
                    fecha = fechasISO[2]
                    break
                case "menu":
                    return gotoFlow(flowReserva)
                default:
                    fecha = ctx.body
                    break
            }

            try {
                const response = await axios.post('http://localhost:3001/confim-event',
                    { fechaLN: fecha },
                    { headers: { 'Content-Type': 'application/json' } })
                const data = response.data;
                if (data?.evento === 'ocupado') {
                    await flowDynamic(data?.response)
                    return fallBack();
                } else if (data?.evento === 'confirmar') {
                    await flowDynamic(data?.response)
                    await state.update({ dateConfirmed: data.dateConfirmed })
                    return;
                }
            } catch (error) {
                if (error.isAxiosError) {
                    console.error('Error en Axios');
                } else {
                    console.error(error)
                }
            }
        }
    ).addAnswer("Confirmas? 'si' o 'no'", { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            const { description, name, dateConfirmed } = state.getMyState()

            if (ctx.body.toLowerCase() == 'si') {
                try {
                    const response = await axios.post('http://localhost:3001/create-event',
                        { date: dateConfirmed, eventName: name, description },
                        { headers: { 'Content-Type': 'application/json' } })
                    const data = response?.data;
                    if (data?.evento === 'creado') {
                        await flowDynamic(data?.response)
                    } else {
                        await flowDynamic(data?.response)
                        return gotoFlow(flowReserva)
                    }
                } catch (error) {
                    if (error.isAxiosError) {
                        console.error('Error en Axios');
                    } else {
                        console.error(error)
                    }
                }
            } else {
                return gotoFlow(flowReserva)
            }
        }
    )

const flowVerReserva = addKeyword(EVENTS.ACTION)
    .addAnswer("Buscando..", null,
        async (ctx, { flowDynamic }) => {
            try {
                const response = await axios.post('http://localhost:3001/find-event',
                    { eventName: ctx.pushName },
                    { headers: { 'Content-Type': 'application/json' } })
                await flowDynamic(`${ctx.pushName} tu turno es el: ${response.data.response}`)
            } catch (error) {
                if (error.isAxiosError) {
                    console.error('Error en Axios');
                } else {
                    console.error(error)
                }
            }
        }
    )
const flowCancelar = addKeyword(EVENTS.ACTION)

// const flowConsultas = addKeyword(EVENTS.WELCOME)
//     .addAction(
//         async (ctx, { flowDynamic, state, fallBack, gotoFlow }) => {
//             const message = ctx.body
//             try {

//                 const history = state.getMyState()?.history ?? []

//                 history.push({
//                     role: "user",
//                     content: message
//                 })
//                 const response = await axios.post('http://localhost:3001/process-message',
//                     { message, prompt, history },
//                     { headers: { 'Content-Type': 'application/json' } }
//                 );

//                 const aiResponse = JSON.parse(response.data.response)
//                 console.log(aiResponse)
//                 history.push({
//                     role: "assistant",
//                     content: aiResponse
//                 })

//                 await state.update({ history: history })
//                 // console.log('historial: ', history)
//                 if (aiResponse.intencion == "reservar") {
//                     return gotoFlow(flowReserva)
//                 } else if (aiResponse.intencion == "consultar") {
//                     await flowDynamic(aiResponse.mensaje)
//                     // return fallBack()
//                 }


//             } catch (error) {
//                 if (error.isAxiosError) {
//                     console.error('Error en Axios');
//                 } else {
//                     console.error(error)
//                 }
//             }

//         })

const main = async () => {
    const adapterDB = new MockAdapter()
    const adapterFlow = createFlow([ flowReserva, flowVerReserva, flowCancelar, flowPrincipal])
    const adapterProvider = createProvider(BaileysProvider)

    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    QRPortalWeb()
}

main()
