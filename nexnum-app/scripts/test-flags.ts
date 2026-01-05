
import 'dotenv/config'

async function test() {
    const res = await fetch('http://localhost:3000/api/search/services?q=Anthropic&limit=1')
    const data = await res.json()
    console.log('Anthropic service:', JSON.stringify(data, null, 2))
}

test()
