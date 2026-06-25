import { Redirect, type Href } from 'one'

export function IndexPage() {
  return <Redirect href={'/home/forums' as Href} />
}
