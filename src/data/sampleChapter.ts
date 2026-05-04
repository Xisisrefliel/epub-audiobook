import type { Book } from '../types'

export const sampleBook: Book = {
  id: 'alice',
  title: "Alice's Adventures in Wonderland",
  author: 'Lewis Carroll',
  chapters: [
    {
      id: 'ch-1',
      title: 'Chapter I — Down the Rabbit-Hole',
      paragraphs: [
        {
          id: 'p1',
          sentences: [
            {
              id: 's1',
              text: 'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.',
            },
            {
              id: 's2',
              text: 'Once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, and what is the use of a book, thought Alice, without pictures or conversations?',
            },
          ],
        },
        {
          id: 'p2',
          sentences: [
            {
              id: 's3',
              text: 'So she was considering in her own mind, as well as she could, for the hot day made her feel very sleepy and stupid, whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.',
            },
          ],
        },
        {
          id: 'p3',
          sentences: [
            {
              id: 's4',
              text: 'There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, "Oh dear! Oh dear! I shall be late!"',
            },
            {
              id: 's5',
              text: 'When she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural.',
            },
            {
              id: 's6',
              text: 'But when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it.',
            },
            {
              id: 's7',
              text: 'Burning with curiosity, she ran across the field after it, and was just in time to see it pop down a large rabbit-hole under the hedge.',
            },
          ],
        },
        {
          id: 'p4',
          sentences: [
            {
              id: 's8',
              text: 'In another moment down went Alice after it, never once considering how in the world she was to get out again.',
            },
            {
              id: 's9',
              text: 'The rabbit-hole went straight on like a tunnel for some way, and then dipped suddenly down, so suddenly that Alice had not a moment to think about stopping herself before she found herself falling down what seemed to be a very deep well.',
            },
          ],
        },
      ],
    },
  ],
}
