// Board writes: every change is a commit to data/user/posts.json via updateUserFile, wrapped in
// withToast so success and failure both show up.
import { withToast } from '../../components/toast.tsx'
import { commitMessage, nextStatus } from '../../lib/board.ts'
import { useMe } from '../../lib/people.ts'
import { usePrefs } from '../../lib/prefs.ts'
import type { Person, Post } from '../../lib/user.ts'
import { updateUserFile } from '../../lib/userData.ts'

export interface BoardActions {
  me: Person | undefined
  /** A posting key is saved and we know who is posting. */
  canPost: boolean
  add: (post: Post) => Promise<boolean>
  replace: (post: Post) => Promise<boolean>
  respond: (post: Post, value: string) => Promise<boolean>
  setArchived: (post: Post, archived: boolean) => Promise<boolean>
  remove: (post: Post) => Promise<boolean>
}

const patch = (id: string, fn: (p: Post) => Post) => (items: Post[]) => items.map((p) => (p.id === id ? fn(p) : p))

export function useBoardActions(): BoardActions {
  const me = useMe()
  const { token } = usePrefs()
  const name = me?.name ?? 'Someone'
  const write = (mutate: (items: Post[]) => Post[], message: string, ok: string) => withToast(() => updateUserFile<Post>('posts', mutate, message), ok)
  return {
    me,
    canPost: !!token && !!me,
    add: (post) => write((items) => [post, ...items.filter((p) => p.id !== post.id)], commitMessage('posted', name, post), 'Posted.'),
    // Editing keeps whatever the other person has answered in the meantime.
    replace: (post) =>
      write(
        patch(post.id, (remote) => {
          const { status: _s, archived: _a, ...rest } = post
          return { ...rest, ...(remote.status ? { status: remote.status } : {}), ...(remote.archived ? { archived: true } : {}) }
        }),
        commitMessage('edited', name, post),
        'Saved your changes.',
      ),
    respond: (post, value) => write(patch(post.id, (p) => nextStatus(p, me?.id ?? '', value)), commitMessage('responded', name, post), 'Saved.'),
    setArchived: (post, archived) =>
      write(
        patch(post.id, (p) => {
          const { archived: _a, ...rest } = p
          return archived ? { ...rest, archived: true } : rest
        }),
        commitMessage(archived ? 'archived' : 'unarchived', name, post),
        archived ? 'Archived.' : 'Moved back to the board.',
      ),
    remove: (post) => write((items) => items.filter((p) => p.id !== post.id), commitMessage('deleted', name, post), 'Deleted.'),
  }
}
