import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Link,
    Preview,
    Section,
    Text,
    Tailwind,
    Hr,
} from '@react-email/components';

interface ConfirmEmailProps {
    name: string;
    confirmLink: string;
}

export const ConfirmEmail = ({ name, confirmLink }: ConfirmEmailProps) => {
    return (
        <Html>
            <Head />
            <Preview>Confirm your specific email address</Preview>
            <Tailwind>
                <Body className="bg-[#0a0a0a] text-white font-sans">
                    <Container className="mx-auto my-10 p-5 w-[465px]">
                        <Section className="mt-8">
                            <Heading className="text-2xl font-bold text-center text-[#cbff3b]">
                                NexNum
                            </Heading>
                        </Section>
                        <Section className="bg-[#13151a] border border-[#2d2f36] rounded-lg p-6 my-6 shadow-[0_0_20px_rgba(203,255,59,0.1)]">
                            <Heading className="text-xl font-bold mb-4 text-white">
                                Confirm Your Email
                            </Heading>
                            <Text className="text-gray-300 text-sm mb-4">
                                Hi {name},
                            </Text>
                            <Text className="text-gray-300 text-sm mb-6">
                                Please confirm your email address to unlock full access to your NexNum account.
                            </Text>
                            <Section className="text-center mb-6">
                                <Link
                                    href={confirmLink}
                                    className="bg-[#cbff3b] text-black font-bold py-3 px-6 rounded-lg text-sm transition-colors hover:bg-[#b8eb2a]"
                                >
                                    Confirm Email
                                </Link>
                            </Section>
                            <Text className="text-gray-400 text-xs mt-4">
                                Or copy and paste this link into your browser:
                            </Text>
                            <Text className="text-gray-500 text-xs break-all">
                                <Link href={confirmLink} className="text-[#cbff3b] underline">
                                    {confirmLink}
                                </Link>
                            </Text>
                            <Hr className="border-[#2d2f36] my-6" />
                            <Text className="text-gray-500 text-xs text-center">
                                Link valid for 48 hours.
                            </Text>
                        </Section>
                        <Text className="text-center text-xs text-gray-600">
                            © {new Date().getFullYear()} NexNum. All rights reserved.
                        </Text>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
};

export default ConfirmEmail;
