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
import { SettingsService } from '@/lib/settings';

interface PasswordResetEmailProps {
    name: string;
    resetLink: string;
}

export const PasswordResetEmail = ({ name, resetLink }: PasswordResetEmailProps) => {
    return (
        <Html>
            <Head />
            <Preview>Reset your NexNum password</Preview>
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
                                Reset Password
                            </Heading>
                            <Text className="text-gray-300 text-sm mb-4">
                                Hi {name},
                            </Text>
                            <Text className="text-gray-300 text-sm mb-6">
                                We received a request to reset your password. If you didn't make this request, you can safely ignore this email.
                            </Text>
                            <Section className="text-center mb-6">
                                <Link
                                    href={resetLink}
                                    className="bg-[#cbff3b] text-black font-bold py-3 px-6 rounded-lg text-sm transition-colors hover:bg-[#b8eb2a]"
                                >
                                    Reset Password
                                </Link>
                            </Section>
                            <Text className="text-gray-400 text-xs mt-4">
                                Or copy and paste this link into your browser:
                            </Text>
                            <Text className="text-gray-500 text-xs break-all">
                                <Link href={resetLink} className="text-[#cbff3b] underline">
                                    {resetLink}
                                </Link>
                            </Text>
                            <Hr className="border-[#2d2f36] my-6" />
                            <Text className="text-gray-500 text-xs text-center">
                                Valid for 30 minutes.
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

export default PasswordResetEmail;
