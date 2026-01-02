import {
    Heading,
    Text,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components } from './theme'

interface MaintenanceEmailProps {
    startTime: string
    endTime: string
    reason: string
}

export const MaintenanceEmail = ({ startTime, endTime, reason }: MaintenanceEmailProps) => {
    return (
        <EmailLayout preview="System Maintenance Notice">
            <Heading style={components.text.h1}>Scheduled Maintenance</Heading>

            <Text style={components.text.body}>
                We will be performing scheduled maintenance to improve our systems.
                During this time, the NexNum dashboard and API may be intermittent.
            </Text>

            <Text style={{ ...components.text.body, fontWeight: 'bold' }}>
                Start Time: {startTime}
                <br />
                End Time: {endTime}
            </Text>

            <Text style={components.text.body}>
                Reason: {reason}
            </Text>

            <Text style={components.text.caption}>
                We apologize for any inconvenience. Check our status page for updates.
            </Text>
        </EmailLayout>
    )
}

export default MaintenanceEmail
