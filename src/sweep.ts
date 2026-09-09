import type { Task } from '@doist/todoist-sdk'

export type SweepReason = { type: 'overdue' } | { type: 'old-undated' }
export type SweepCandidate = { task: Task; reason: SweepReason }

function dayInZone(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function getSweepReason(task: Task, now: Date, timeZone = 'UTC'): SweepReason | null {
    if (task.due) {
        if (task.due.isRecurring) return null
        const today = dayInZone(now, timeZone)
        if (task.due.datetime) return new Date(task.due.datetime) < now ? { type: 'overdue' } : null
        return task.due.date < today ? { type: 'overdue' } : null
    }
    if (task.addedAt && now.getTime() - task.addedAt.getTime() >= 30 * 24 * 60 * 60 * 1000) {
        return { type: 'old-undated' }
    }
    return null
}

export function findCandidates(tasks: Task[], now: Date, timeZone = 'UTC'): SweepCandidate[] {
    return tasks.map(task => ({ task, reason: getSweepReason(task, now, timeZone) })).filter((x): x is SweepCandidate => x.reason !== null)
        .sort((a, b) => {
            const rank = (r: SweepReason) => r.type === 'overdue' ? 0 : 1
            const dueA = a.task.due?.date ? Date.parse(a.task.due.date) : Number.MAX_SAFE_INTEGER
            const dueB = b.task.due?.date ? Date.parse(b.task.due.date) : Number.MAX_SAFE_INTEGER
            return rank(a.reason) - rank(b.reason) || (a.reason.type === 'overdue' ? dueA - dueB : (a.task.addedAt?.getTime() ?? 0) - (b.task.addedAt?.getTime() ?? 0))
        })
}
