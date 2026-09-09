import { TodoistApi, type Task } from '@doist/todoist-sdk'

export async function getProjectTasks(token: string, projectId: string): Promise<Task[]> {
    const api = new TodoistApi(token)
    const tasks: Task[] = []
    let cursor: string | null = null
    do {
        const page = await api.getTasks({ projectId, limit: 200, cursor })
        tasks.push(...page.results)
        cursor = page.nextCursor
    } while (cursor)
    return tasks
}

export async function updateTaskDate(token: string, taskId: string, action: string): Promise<Task> {
    const api = new TodoistApi(token)
    const dueString = action === 'sweep.today' ? 'today' : action === 'sweep.next-week' ? 'next week' : 'no date'
    return api.updateTask(taskId, { dueString, dueLang: 'en' })
}
