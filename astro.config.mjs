// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://ahmedasmar.github.io',
	integrations: [
		starlight({
			title: 'Ahmad Asmar',
			description:
				'Staff DevOps / Platform Lead — AWS, EKS, GitOps, OSS maintainer (3,767 Terraform Registry downloads · 158★ Claude Code skills marketplace).',
			logo: {
				src: './src/assets/avatar.svg',
				replacesTitle: false,
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/ahmedasmar' },
				{ icon: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/ahmadasmar' },
				{ icon: 'pencil', label: 'Medium articles', href: 'https://medium.com/@ahmed.asmar' },
			],
			editLink: {
				baseUrl: 'https://github.com/ahmedasmar/ahmedasmar.github.io/edit/main/',
			},
			lastUpdated: true,
			pagination: false,
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
			customCss: ['./src/styles/custom.css'],
			head: [
				{
					tag: 'link',
					attrs: {
						rel: 'preconnect',
						href: 'https://fonts.googleapis.com',
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'preconnect',
						href: 'https://fonts.gstatic.com',
						crossorigin: '',
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'stylesheet',
						href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..900,0..100&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap',
					},
				},
				{
					tag: 'meta',
					attrs: { property: 'og:image', content: 'https://ahmedasmar.github.io/og-image.png' },
				},
				{
					tag: 'meta',
					attrs: { name: 'twitter:card', content: 'summary_large_image' },
				},
			],
			sidebar: [
				{ label: 'Home', link: '/' },
				{
					label: 'Projects',
					items: [
						{ label: 'Terraform GitLab Runner module', slug: 'projects/terraform-runner-module' },
						{ label: 'DevOps Claude Skills', slug: 'projects/devops-claude-skills' },
						{ label: 'Cross-Account TargetGroupBinding', slug: 'projects/cross-account-tgb' },
						{ label: 'GitOps engine (ArgoCD)', slug: 'projects/gitops-engine' },
						{ label: 'Kyverno fleet rollout', slug: 'projects/kyverno-fleet-rollout' },
						{ label: 'Crossplane — IaC v2', slug: 'projects/crossplane-iac-v2' },
					],
				},
				{
					label: 'Writing',
					items: [
						{ label: 'Cross-account TargetGroupBinding (AWS LBC v3)', slug: 'writing/cross-account-tgb' },
						{ label: 'EKS major-version upgrade — fleet playbook', slug: 'writing/eks-major-version-upgrade' },
						{ label: 'GitOps engine — Terraform → ArgoCD', slug: 'writing/gitops-engine' },
						{ label: 'Modern Terraform CI/CD on GitLab', slug: 'writing/modern-terraform-cicd' },
						{ label: 'EKS Pod Identity — fleet rollout', slug: 'writing/pod-identity-rollout' },
						{ label: 'Scale-to-zero GitLab runners', slug: 'writing/scale-to-zero-runners' },
					],
				},
				{ label: 'Stack', slug: 'stack' },
				{ label: 'About', slug: 'about' },
			],
		}),
	],
});
