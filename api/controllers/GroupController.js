import {
  createGroup,
  findGroup,
  listMembers,
  listMyGroups,
  listPublicGroups,
  joinGroup,
  leaveGroup,
  addMemberByNickname,
  removeMember,
} from '../models/Group.js'
import { parsePositiveInt, parsePagination, badRequest } from '../middleware/validation.js'

// The acting user is always req.userId from the verified JWT. Roles are read from
// group_members of that group, never from the request body (fields like role or user_id are ignored).

const NAME_MIN = 2
const NAME_MAX = 100
const DESCRIPTION_MAX = 1000
const VISIBILITIES = ['public', 'private']

const httpError = (status, message, fields) =>
  Object.assign(new Error(message), { status, ...(fields ? { fields } : {}) })

// A private group is "not found" for outsiders, so its existence is not revealed.
const groupNotFound = () => httpError(404, 'Ryhmää ei löytynyt.')
const signedOut = () => httpError(401, 'Kirjaudu sisään jatkaaksesi.')
const onlyAdmin = () => httpError(403, 'Vain ryhmän ylläpitäjä voi tehdä tämän.')

const length = (text) => [...text].length

const parseGroupBody = (body) => {
  const { name, description, visibility = 'private' } = body ?? {}
  const fields = {}
  let cleanName = ''
  if (typeof name !== 'string') {
    fields.name = 'Anna ryhmälle nimi.'
  } else {
    cleanName = name.trim()
    if (length(cleanName) < NAME_MIN) fields.name = 'Nimessä pitää olla vähintään 2 merkkiä.'
    else if (length(cleanName) > NAME_MAX) fields.name = 'Nimi saa olla enintään 100 merkkiä.'
  }
  let cleanDescription = null
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') fields.description = 'Kuvauksen pitää olla tekstiä.'
    else {
      cleanDescription = description.trim() || null
      if (cleanDescription && length(cleanDescription) > DESCRIPTION_MAX) {
        fields.description = 'Kuvaus saa olla enintään 1000 merkkiä.'
      }
    }
  }
  if (!VISIBILITIES.includes(visibility)) fields.visibility = 'Valitse julkinen tai yksityinen.'
  if (Object.keys(fields).length) throw httpError(400, 'Tarkista ryhmän tiedot.', fields)
  return { name: cleanName, description: cleanDescription, visibility }
}

// Group page data. Members are listed for public groups and for members of private groups.
const groupView = async (groupId, userId) => {
  const group = await findGroup(groupId, userId)
  if (!group) return null
  const { my_role: myRole, ...rest } = group
  if (rest.visibility === 'private' && !myRole) return null
  return { group: rest, my_role: myRole, members: await listMembers(groupId) }
}

// POST /api/groups { name, description?, visibility } -> 201 group view (caller is admin)
const create = async (req, res, next) => {
  try {
    const data = parseGroupBody(req.body)
    const groupId = await createGroup({ ...data, userId: req.userId })
    res.status(201).json(await groupView(groupId, req.userId))
  } catch (error) {
    if (error.code === '23503') return next(signedOut()) // account deleted meanwhile
    next(error)
  }
}

// GET /api/groups/mine -> { items: [group + my_role + joined_at] }
const mine = async (req, res, next) => {
  try {
    res.status(200).json({ items: await listMyGroups(req.userId) })
  } catch (error) {
    next(error)
  }
}

// GET /api/groups?q=&limit=&offset= -> public groups only (no login needed)
const listPublic = async (req, res, next) => {
  try {
    let search = null
    if (req.query.q !== undefined) {
      if (typeof req.query.q !== 'string') throw badRequest('q must be a string')
      search = req.query.q.trim() || null
      if (search && search.length > 100) throw badRequest('q is too long')
    }
    const { limit, offset } = parsePagination(req.query)
    res.status(200).json({ items: await listPublicGroups({ search, limit, offset }), limit, offset })
  } catch (error) {
    next(error)
  }
}

// GET /api/groups/:id (token optional) -> { group, my_role, members }
const show = async (req, res, next) => {
  try {
    const groupId = parsePositiveInt(req.params.id, 'id')
    const view = await groupView(groupId, req.userId)
    if (!view) throw groupNotFound()
    res.status(200).json(view)
  } catch (error) {
    next(error)
  }
}

// POST /api/groups/:id/join -> 201 (joined) or 200 (already a member); private -> 404
const join = async (req, res, next) => {
  try {
    const groupId = parsePositiveInt(req.params.id, 'id')
    const result = await joinGroup(groupId, req.userId)
    if (result === 'not_found' || result === 'private') throw groupNotFound()
    res.status(result === 'joined' ? 201 : 200).json(await groupView(groupId, req.userId))
  } catch (error) {
    if (error.code === '23503') return next(signedOut())
    next(error)
  }
}

// DELETE /api/groups/:id/membership -> 204 (own membership only)
const leave = async (req, res, next) => {
  try {
    const groupId = parsePositiveInt(req.params.id, 'id')
    const result = await leaveGroup(groupId, req.userId)
    if (result === 'not_found') throw groupNotFound()
    if (result === 'not_member') throw httpError(404, 'Et ole tämän ryhmän jäsen.')
    res.status(204).end()
  } catch (error) {
    next(error)
  }
}

// POST /api/groups/:id/members { nickname } (admin) -> 201 { member }
const addMember = async (req, res, next) => {
  try {
    const groupId = parsePositiveInt(req.params.id, 'id')
    const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.trim() : ''
    if (!nickname || nickname.length > 20) {
      throw httpError(400, 'Tarkista nimimerkki.', { nickname: 'Syötä käyttäjän nimimerkki.' })
    }
    const result = await addMemberByNickname(groupId, req.userId, nickname)
    switch (result.status) {
      case 'not_found':
      case 'hidden':
        throw groupNotFound()
      case 'forbidden':
        throw onlyAdmin()
      case 'user_not_found':
        throw httpError(404, 'Käyttäjää ei löytynyt.', { nickname: 'Käyttäjää ei löytynyt tällä nimimerkillä.' })
      case 'already_member':
        throw httpError(409, 'Käyttäjä on jo ryhmän jäsen.', { nickname: 'Käyttäjä on jo ryhmän jäsen.' })
      default:
        res.status(201).json({ member: result.member })
    }
  } catch (error) {
    if (error.code === '23503' && error.constraint === 'group_members_user_id_fkey') {
      // The target account was deleted at the same moment.
      return next(httpError(404, 'Käyttäjää ei löytynyt.', { nickname: 'Käyttäjää ei löytynyt tällä nimimerkillä.' }))
    }
    next(error)
  }
}

// DELETE /api/groups/:id/members/:userId (admin removes an ordinary member) -> 204
const kickMember = async (req, res, next) => {
  try {
    const groupId = parsePositiveInt(req.params.id, 'id')
    const targetId = parsePositiveInt(req.params.userId, 'userId')
    const result = await removeMember(groupId, req.userId, targetId)
    switch (result) {
      case 'not_found':
      case 'hidden':
        throw groupNotFound()
      case 'forbidden':
        throw onlyAdmin()
      case 'self':
        throw httpError(400, 'Poistu ryhmästä "Poistu ryhmästä" -painikkeella.')
      case 'not_member':
        throw httpError(404, 'Käyttäjä ei ole ryhmän jäsen.')
      case 'target_admin':
        throw httpError(403, 'Ylläpitäjää ei voi poistaa ryhmästä.')
      default:
        res.status(204).end()
    }
  } catch (error) {
    next(error)
  }
}

export { create, mine, listPublic, show, join, leave, addMember, kickMember }
