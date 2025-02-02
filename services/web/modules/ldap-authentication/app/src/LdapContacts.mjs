import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import passport from 'passport'
import ldapjs from 'ldapauth-fork/node_modules/ldapjs/lib/index.js'
import UserGetter from '../../../../app/src/Features/User/UserGetter.js'
import { splitFullName } from './AuthenticationManagerLdap.mjs'

async function fetchLdapContacts(userId, contacts) {
  if (!Settings.ldap?.enable || !process.env.OVERLEAF_LDAP_CONTACTS_FILTER) {
    return []
  }

  const ldapOpts = passport._strategy('custom-fail-ldapauth').options.server
  const { attEmail, attFirstName = "", attLastName = "", attName = "" } = Settings.ldap
  const {
    url,
    timeout,
    connectTimeout,
    tlsOptions,
    starttls,
    bindDN,
    bindCredentials,
  } = ldapOpts
  const searchBase = process.env.OVERLEAF_LDAP_CONTACTS_SEARCH_BASE || ldapOpts.searchBase
  const searchScope = process.env.OVERLEAF_LDAP_CONTACTS_SEARCH_SCOPE || 'sub'
  const ldapConfig = { url, timeout, connectTimeout, tlsOptions }

  let ldapUsers
  const client = ldapjs.createClient(ldapConfig)
  try {
    if (starttls) {
      await _upgradeToTLS(client, tlsOptions)
    }
    await _bindLdap(client, bindDN, bindCredentials)

    const filter = await _formContactsSearchFilter(client, ldapOpts, userId, process.env.OVERLEAF_LDAP_CONTACTS_FILTER)
    const searchOptions = { scope: searchScope, attributes: [attEmail, attFirstName, attLastName, attName], filter }

    ldapUsers = await _searchLdap(client, searchBase, searchOptions)
  } catch (err) {
    logger.warn({ err }, 'error in fetchLdapContacts')
    return []
  } finally {
    client.unbind()
  }

  const newLdapContacts = ldapUsers.reduce((acc, ldapUser) => {
    const email = Array.isArray(ldapUser[attEmail])
                    ? ldapUser[attEmail][0]?.toLowerCase()
                    : ldapUser[attEmail]?.toLowerCase()
    if (!email) return acc
    if (!contacts.some(contact => contact.email === email)) {
      let nameParts = ["",""]
      if ((!attFirstName || !attLastName) && attName) {
        nameParts = splitFullName(ldapUser[attName] || "")
      }
      const firstName = attFirstName ? (ldapUser[attFirstName] || "") : nameParts[0]
      const lastName  = attLastName  ? (ldapUser[attLastName]  || "") : nameParts[1]
      acc.push({
        first_name: firstName,
        last_name: lastName,
        email: email,
        type: 'user',
      })
    }
    return acc
  }, [])

  return newLdapContacts.sort((a, b) =>
    a.last_name.localeCompare(b.last_name) ||
    a.first_name.localeCompare(a.first_name) ||
    a.email.localeCompare(b.email)
  )
}

function _upgradeToTLS(client, tlsOptions) {
  return new Promise((resolve, reject) => {
    client.on('error', error => reject(new Error(`LDAP client error: ${error}`)))
    client.on('connect', () => {
      client.starttls(tlsOptions, null, error => {
        if (error) {
          reject(new Error(`StartTLS error: ${error}`))
        } else {
          resolve()
        }
      })
    })
  })
}

function _bindLdap(client, bindDN, bindCredentials) {
  return new Promise((resolve, reject) => {
    client.bind(bindDN, bindCredentials, error => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

function _searchLdap(client, baseDN, options) {
  return new Promise((resolve, reject) => {
    const searchEntries = []
    client.search(baseDN, options, (error, res) => {
      if (error) {
        reject(error)
      } else {
        res.on('searchEntry', entry => searchEntries.push(entry.object))
        res.on('error', reject)
        res.on('end', () => resolve(searchEntries))
      }
    })
  })
}

async function _formContactsSearchFilter(client, ldapOpts, userId, contactsFilter) {
  const searchProperty = process.env.OVERLEAF_LDAP_CONTACTS_PROPERTY
  if (!searchProperty) {
    return contactsFilter
  }
  const email = await UserGetter.promises.getUserEmail(userId)
  const searchOptions = {
    scope: ldapOpts.searchScope,
    attributes: [searchProperty],
    filter: `(${Settings.ldap.attEmail}=${email})`,
  }
  const searchBase = ldapOpts.searchBase
  const ldapUser = (await _searchLdap(client, searchBase, searchOptions))[0]
  const searchPropertyValue = ldapUser ? ldapUser[searchProperty]
                                       : process.env.OVERLEAF_LDAP_CONTACTS_NON_LDAP_VALUE || 'IMATCHNOTHING'
  return contactsFilter.replace(/{{userProperty}}/g, searchPropertyValue)
}

export default fetchLdapContacts
