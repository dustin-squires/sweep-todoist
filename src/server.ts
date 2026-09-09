import { createHmac, timingSafeEqual } from 'node:crypto'
import express, { type Request, type Response } from 'express'
import 'dotenv/config'

import {
    SubmitAction,
    TextBlock,
    TodoistCard,
    type TodoistCardRequest,
} from '@doist/ui-extensions-core'

const port = Number(process.env.PORT ?? 3000)
const verificationToken = process.env.TODOIST_VERIFICATION_TOKEN?.trim()
const rawBodies = new WeakMap<object, Buffer>()

const app = express()

app.use(
    express.json({
        verify(request, _response, body) {
            rawBodies.set(request, Buffer.from(body))
        },
    }),
)

function hasValidSignature(request: Request): boolean {
    if (!verificationToken) return false

    const supplied = request.header('x-todoist-hmac-sha256')
    const rawBody = rawBodies.get(request)
    if (!supplied || !rawBody) return false

    const expected = createHmac('sha256', verificationToken).update(rawBody).digest('base64')
    const suppliedBuffer = Buffer.from(supplied)
    const expectedBuffer = Buffer.from(expected)

    return (
        suppliedBuffer.length === expectedBuffer.length &&
        timingSafeEqual(suppliedBuffer, expectedBuffer)
    )
}

function connectedCard(projectName: string | undefined): TodoistCard {
    const card = new TodoistCard()
    card.todoistCardVersion = '0.6'
    card.addItem(TextBlock.from({ text: 'Sweep', size: 'large', weight: 'bolder' }))
    card.addItem(
        TextBlock.from({
            text: `Project: ${projectName ?? 'Unknown project'}\n\nSweep is connected.`,
            wrap: true,
        }),
    )
    card.addAction(
        SubmitAction.from({
            id: 'sweep.start',
            title: 'Start sweep',
            style: 'positive',
            associatedInputs: 'none',
        }),
    )
    return card
}

app.get('/health', (_request: Request, response: Response) => {
    response.json({ status: 'ok' })
})

app.post('/sweep', (request: Request, response: Response) => {
    if (!hasValidSignature(request)) {
        response.status(401).json({ error: 'Request verification failed' })
        return
    }

    const extensionRequest = request.body as TodoistCardRequest
    const project = extensionRequest.context?.todoist?.project
    response.json({ card: connectedCard(project?.name) })
})

app.listen(port, () => {
    console.log(`Sweep UI Extension server running on port ${port}.`)
})
