import { createHmac, timingSafeEqual } from 'node:crypto'
import express, { type Request, type Response } from 'express'
import 'dotenv/config'

import {
    SubmitAction,
    TextBlock,
    TodoistCard,
    type TodoistCardRequest,
} from '@doist/ui-extensions-core'
import { getProjectTasks, updateTaskDate } from './todoist.js'
import { findCandidates } from './sweep.js'

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

function sweepCard(projectName: string | undefined, count?: number, candidate?: any, candidateIds: string[] = []): TodoistCard {
    const card = new TodoistCard()
    card.todoistCardVersion = '0.6'
    card.addItem(TextBlock.from({ text: 'Sweep', size: 'large', weight: 'bolder' }))
    if (candidate) card.addItem(TextBlock.from({ text: 'Review task', size: 'medium', weight: 'bolder' }))
    card.addItem(
        TextBlock.from({
            text: candidate
                ? `Project: ${projectName ?? 'Unknown project'}\n\n**${candidate.task.content}**\n\n**Description**\n${candidate.task.description || 'No description.'}\n\n**Reason**\n${candidate.reason.type === 'overdue' ? 'Overdue' : 'Old and undated'}\n\n[Open task](${candidate.task.url})`
                : count === undefined
                ? `Project: ${projectName ?? 'Unknown project'}\n\nSweep is connected.`
                : `Project: ${projectName ?? 'Unknown project'}\n\n${count === 0 ? 'Nothing needs sweeping.' : `${count} task${count === 1 ? '' : 's'} ready to review.`}`,
            wrap: true,
        }),
    )
    if (candidate) {
        for (const [id, title] of [['sweep.today', 'Today'], ['sweep.next-week', 'Next week'], ['sweep.remove-date', 'Remove date'], ['sweep.keep', 'Keep as-is']] as const)
            card.addAction(SubmitAction.from({ id, title, associatedInputs: 'none', data: { sweepAction: id, taskId: candidate.task.id, remainingTaskIds: candidateIds } }))
    } else card.addAction(SubmitAction.from({ id: 'sweep.start', title: 'Start sweep', style: 'positive', associatedInputs: 'none', data: { remainingTaskIds: candidateIds } }))
    return card
}

app.get('/health', (_request: Request, response: Response) => {
    response.json({ status: 'ok' })
})

app.post('/sweep', async (request: Request, response: Response) => {
    if (!hasValidSignature(request)) {
        response.status(401).json({ error: 'Request verification failed' })
        return
    }

    const extensionRequest = request.body as TodoistCardRequest
    const project = extensionRequest.context?.todoist?.project
    const projectId = project?.id
    if (!projectId) {
        response.json({ card: sweepCard(project?.name) })
        return
    }
    const appToken = request.header('x-todoist-apptoken')
    if (!appToken) {
        response.status(400).json({ error: 'Todoist app token missing' })
        return
    }
    try {
        const tasks = await getProjectTasks(appToken, projectId)
        const userTimezone = ((extensionRequest.context?.user as unknown as { timezone?: string } | undefined)?.timezone) ?? 'UTC'
        const candidates = findCandidates(tasks, new Date(), userTimezone)
        const action = extensionRequest.action as unknown as Record<string, unknown> | undefined
        const params = (action?.params ?? {}) as Record<string, unknown>
        const data = (action?.data ?? {}) as Record<string, unknown>
        const actionId = typeof action === 'string' ? action : (action?.actionId as string | undefined) ?? (data.sweepAction as string | undefined) ?? (action?.actionType === 'submit' ? 'sweep.start' : undefined)
        const requestedTaskId = data.taskId as string | undefined
        const current = candidates.find(c => c.task.id === requestedTaskId) ?? candidates[0]
        if (actionId && ['sweep.today', 'sweep.next-week', 'sweep.remove-date'].includes(actionId) && current) {
            await updateTaskDate(appToken, current.task.id, actionId)
        }
        const isReviewAction = actionId && ['sweep.today', 'sweep.next-week', 'sweep.remove-date', 'sweep.keep', 'sweep.open'].includes(actionId)
        const remaining = isReviewAction ? candidates.filter(c => c.task.id !== current?.task.id) : candidates
        response.json({ card: sweepCard(project?.name, remaining.length, actionId === 'sweep.start' || isReviewAction ? remaining[0] : undefined, remaining.map(c => c.task.id)) })
    } catch (error) {
        console.error('Todoist task fetch failed', error)
        response.status(502).json({ error: 'Unable to fetch project tasks' })
    }
})

app.listen(port, () => {
    console.log(`Sweep UI Extension server running on port ${port}.`)
})
