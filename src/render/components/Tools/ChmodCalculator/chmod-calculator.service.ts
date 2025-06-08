import { reduce, get } from 'lodash-es'
import type { GroupPermissions, Permissions } from './chmod-calculator.types'

export { computeChmodOctalRepresentation, computeChmodSymbolicRepresentation }

function computeChmodOctalRepresentation({ permissions }: { permissions: Permissions }): string {
  const permissionValue = { read: 4, write: 2, execute: 1 }

  const getGroupPermissionValue = (permission: GroupPermissions) =>
    reduce(
      permission,
      (acc, isPermSet, key) => acc + (isPermSet ? get(permissionValue, key, 0) : 0),
      0
    )

  return [
    getGroupPermissionValue(permissions.owner),
    getGroupPermissionValue(permissions.group),
    getGroupPermissionValue(permissions.public)
  ].join('')
}

function computeChmodSymbolicRepresentation({ permissions }: { permissions: Permissions }): string {
  const permissionValue = { read: 'r', write: 'w', execute: 'x' }

  const getGroupPermissionValue = (permission: GroupPermissions) =>
    reduce(
      permission,
      (acc, isPermSet, key) => acc + (isPermSet ? get(permissionValue, key, '') : '-'),
      ''
    )

  return [
    getGroupPermissionValue(permissions.owner),
    getGroupPermissionValue(permissions.group),
    getGroupPermissionValue(permissions.public)
  ].join('')
}
