import { elements, text } from './xml'
import { uninvertName, type CatalogueRecord } from './marc'
import { languageFromCode } from './language'

// The BnF's Dublin Core records: "La Petite chenille / E. Carle ; traduit",
// "Carle, Eric (1929-2021). Auteur du texte", and an ark identifier.

const ROLE = /\.\s+(?:Auteur|Illustrateur|Traducteur|Adaptateur|Éditeur|Préfacier|Directeur|Compositeur|Narrateur)\b[^.]*\.?$/i

export interface BnfRecord extends CatalogueRecord {
  ark?: string
}

export function parseBnfDublinCore(xml: string): BnfRecord[] {
  const records: BnfRecord[] = []
  for (const data of elements(xml, 'recordData')) {
    const title = text(elements(data.inner, 'title')[0])
      ?.split(' / ')[0]
      .replace(/[\s:;,.=]+$/, '')
    if (!title) continue
    const creator = text(elements(data.inner, 'creator')[0])?.replace(ROLE, '')
    const ark = elements(data.inner, 'identifier')
      .map(text)
      .find((id) => id?.includes('ark:/'))
      ?.replace(/^.*(ark:\/.*)$/, '$1')
    const language = languageFromCode(text(elements(data.inner, 'language')[0]))
    records.push({ title, author: creator ? uninvertName(creator) : undefined, language, ark })
  }
  return records
}
