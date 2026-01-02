import {
    Button,
    Heading,
    Section,
    Img,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors } from './theme'

interface AnnouncementEmailProps {
    title: string
    content: string // HTML string
    actionLabel?: string
    actionUrl?: string
    imageUrl?: string
}

export const AnnouncementEmail = ({
    title,
    content,
    actionLabel,
    actionUrl,
    imageUrl
}: AnnouncementEmailProps) => {
    return (
        <EmailLayout preview={title}>
            {imageUrl && (
                <Section style={imageContainer}>
                    <Img
                        src={imageUrl}
                        width="100%"
                        height="auto"
                        style={image}
                        alt="Announcement"
                    />
                </Section>
            )}

            <Heading style={components.text.h1}>{title}</Heading>

            {/* Dangerously set HTML for flexible content */}
            <div dangerouslySetInnerHTML={{ __html: content }} style={htmlContent} />

            {/* Optional Action Button */}
            {actionLabel && actionUrl && (
                <Section style={btnContainer}>
                    <Button style={components.button.primary} href={actionUrl}>
                        {actionLabel}
                    </Button>
                </Section>
            )}
        </EmailLayout>
    )
}

// Styles
const htmlContent = {
    ...components.text.body,
    lineHeight: '1.6',
}

const imageContainer = {
    marginBottom: '24px',
    borderRadius: '8px',
    overflow: 'hidden',
}

const image = {
    borderRadius: '8px',
    border: `1px solid ${colors.neutral.border}`,
}

const btnContainer = {
    textAlign: 'center' as const,
    marginTop: '32px',
}

export default AnnouncementEmail
