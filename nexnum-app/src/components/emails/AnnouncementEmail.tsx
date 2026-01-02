import {
    Button,
    Heading,
    Section,
    Text,
    Img,
} from '@react-email/components'
import EmailLayout from './Layout'

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

            <Heading style={h1}>{title}</Heading>

            {/* Dangerously set HTML for flexible content */}
            <div dangerouslySetInnerHTML={{ __html: content }} style={htmlContent} />

            {/* Optional Action Button */}
            {actionLabel && actionUrl && (
                <Section style={btnContainer}>
                    <Button style={button} href={actionUrl}>
                        {actionLabel}
                    </Button>
                </Section>
            )}
        </EmailLayout>
    )
}

// Styles
const h1 = {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0 0 24px',
}

const htmlContent = {
    color: '#cbd5e1',
    fontSize: '16px',
    lineHeight: '1.6',
}

const imageContainer = {
    marginBottom: '24px',
    borderRadius: '8px',
    overflow: 'hidden',
}

const image = {
    borderRadius: '8px',
    border: '1px solid #334155',
}

const btnContainer = {
    textAlign: 'center' as const,
    marginTop: '32px',
}

const button = {
    backgroundColor: '#8b5cf6',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
    padding: '12px 24px',
}

export default AnnouncementEmail
