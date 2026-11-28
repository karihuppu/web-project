import * as Share from '../models/WatchlistShare.js'
import { findGroup } from '../models/Group.js'

const fail = (res, status, message) => res.status(status).json({ error: { message, status } })


const toId = (v) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}


async function visibleGroup(req, res) {
  const groupId = toId(req.params.groupId)
  if (!groupId) {
    fail(res, 400, 'Virheellinen tunniste.')
    return null
  }
  const group = await findGroup(groupId, req.userId)
  if (!group || (group.visibility === 'private' && !group.my_role)) {
    fail(res, 404, 'Ryhmää ei löytynyt.')
    return null
  }
  return group
}



export async function listShares(req, res, next) {
  try {
    const id = toId(req.params.id)
    if (!id) return fail(res, 400, 'Virheellinen tunniste.')
    const shares = await Share.sharesOf(id, req.userId)
    if (!shares) return fail(res, 404, 'Listaa ei löytynyt.')
    res.json({ shares })
  } catch (e) { next(e) }
}

export async function share(req, res, next) {
  try {
    const id = toId(req.params.id)
    const groupId = toId(req.body?.group_id)
    if (!id || !groupId) return fail(res, 400, 'Virheellinen tunniste.')

    const { status, share: row } = await Share.shareList(id, req.userId, groupId)
    if (status === 'list_not_found') return fail(res, 404, 'Listaa ei löytynyt.')
    if (status === 'group_not_found') return fail(res, 404, 'Ryhmää ei löytynyt.')
    if (status === 'forbidden') return fail(res, 403, 'Voit jakaa listan vain ryhmään, jonka jäsen olet.')
    if (status === 'already') return fail(res, 409, 'Lista on jo jaettu tähän ryhmään.')
    res.status(201).json({ share: row })
  } catch (e) { next(e) }
}

export async function unshare(req, res, next) {
  try {
    const id = toId(req.params.id)
    const groupId = toId(req.params.groupId)
    if (!id || !groupId) return fail(res, 400, 'Virheellinen tunniste.')
    if (!(await Share.unshare(id, req.userId, groupId))) return fail(res, 404, 'Jakoa ei löytynyt.')
    res.status(204).end()
  } catch (e) { next(e) }
}



export async function groupLists(req, res, next) {
  try {
    const group = await visibleGroup(req, res)
    if (!group) return
    res.json({ watchlists: await Share.listForGroup(group.id) })
  } catch (e) { next(e) }
}

export async function groupList(req, res, next) {
  try {
    const group = await visibleGroup(req, res)
    if (!group) return
    const id = toId(req.params.id)
    if (!id) return fail(res, 400, 'Virheellinen tunniste.')
    const watchlist = await Share.findSharedList(group.id, id)
    if (!watchlist) return fail(res, 404, 'Listaa ei löytynyt.')
    res.json({ watchlist })
  } catch (e) { next(e) }
}

export async function copy(req, res, next) {
  try {
    const group = await visibleGroup(req, res)
    if (!group) return
    const id = toId(req.params.id)
    if (!id) return fail(res, 400, 'Virheellinen tunniste.')
    const watchlist = await Share.copySharedList(group.id, id, req.userId)
    if (!watchlist) return fail(res, 404, 'Listaa ei löytynyt.')
    res.status(201).json({ watchlist })
  } catch (e) {
    if (e.code === '23505') return fail(res, 409, 'Sinulla on jo lista tällä nimellä.')
    next(e)
  }
}